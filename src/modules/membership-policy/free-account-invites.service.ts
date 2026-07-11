import { createHash, randomBytes } from "crypto";
import { AuditSeverity, Prisma } from "@prisma/client";
import { z } from "zod";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { isAdminRole } from "@/lib/platform/roles";
import { sendSmtpMail } from "@/lib/platform/smtp";
import { readPlatformEnv } from "@/lib/platform/env";
import { tierPolicies } from "@/modules/membership-policy/policy";

const MODULE_KEY = "free-account-invites";

export class FreeInviteError extends Error {}

const generateInviteSchema = z.object({
  recipientEmail: z.string().email().optional().or(z.literal("")),
  assignedUserIdentifier: z.string().trim().max(180).optional().or(z.literal("")),
  expiresInDays: z.coerce.number().int().min(1).max(90).default(7),
  sendEmail: z.boolean().default(false)
});

const emailInviteSchema = z.object({
  inviteCode: z.string().min(8),
  recipientEmail: z.string().email()
});

const applyInviteSchema = z.object({
  inviteCode: z.string().min(8),
  userIdentifier: z.string().trim().min(2).max(180)
});

const revokeInviteSchema = z.object({
  inviteId: z.string().min(1)
});

async function isAdminUser(userId?: string) {
  if (!userId) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  return isAdminRole(user?.role);
}

export function normalizeFreeAccountInviteCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function hashFreeAccountInviteCode(value: string) {
  return createHash("sha256").update(normalizeFreeAccountInviteCode(value)).digest("hex");
}

function createInviteCode() {
  return `TS-FREE-${randomBytes(5).toString("hex").toUpperCase()}`;
}

function previewCode(code: string) {
  const normalized = normalizeFreeAccountInviteCode(code);
  return `...${normalized.slice(-6)}`;
}

function normalizeOptionalEmail(value?: string) {
  const trimmed = value?.trim().toLowerCase();
  return trimmed || null;
}

async function findUserByIdentifier(identifier?: string | null) {
  const normalized = identifier?.trim().replace(/^@/, "").toLowerCase();

  if (!normalized) return null;

  return prisma.user.findFirst({
    where: {
      OR: [{ email: normalized }, { username: normalized }]
    },
    select: {
      id: true,
      email: true,
      username: true,
      profile: { select: { displayName: true } }
    }
  });
}

function userLabel(user?: { email: string; username: string; profile?: { displayName: string | null } | null } | null) {
  return user?.profile?.displayName ?? user?.username ?? user?.email ?? null;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}

function inviteEmailDetails(code: string, expiresAt: Date) {
  const normalizedCode = normalizeFreeAccountInviteCode(code);
  const env = readPlatformEnv();
  const origin = env.APP_ORIGIN || env.NEXTAUTH_URL || "https://theta-space.net";
  const signupUrl = `${new URL(origin).origin}/signup`;
  const expirationLabel = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC"
  }).format(expiresAt);

  return { normalizedCode, signupUrl, expirationLabel };
}

function inviteEmailText(code: string, expiresAt: Date) {
  const { normalizedCode, signupUrl, expirationLabel } = inviteEmailDetails(code, expiresAt);

  return [
    "You’re invited to Theta-Space.",
    "",
    "Theta-Space is an invite-only community for thoughtful connection, communication, and shared discovery.",
    "",
    `Your one-time invite code: ${normalizedCode}`,
    "",
    `Create your account: ${signupUrl}`,
    "",
    `This invitation expires on ${expirationLabel} (UTC) and can only be used once.`,
    "",
    "If you did not expect this invitation, you can safely ignore this email.",
    "",
    "— The Theta-Space team"
  ].join("\n");
}

function inviteEmailHtml(code: string, expiresAt: Date) {
  const { normalizedCode, signupUrl, expirationLabel } = inviteEmailDetails(code, expiresAt);
  const safeCode = escapeHtml(normalizedCode);
  const safeSignupUrl = escapeHtml(signupUrl);
  const safeExpirationLabel = escapeHtml(expirationLabel);

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#0b1018;color:#d9e1ef;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1018;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#111a28;border:1px solid #806b2c;border-radius:14px;overflow:hidden;">
          <tr><td style="padding:28px 32px 20px;background:#0f1724;border-bottom:1px solid #806b2c;">
            <div style="font-size:13px;letter-spacing:3px;font-weight:bold;color:#ffd34e;">THETA-SPACE</div>
            <h1 style="margin:18px 0 0;color:#f3f6fb;font-size:30px;line-height:1.2;">You’re invited.</h1>
          </td></tr>
          <tr><td style="padding:30px 32px;">
            <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">You’ve been invited to join Theta-Space, an invite-only community for thoughtful connection, communication, and shared discovery.</p>
            <p style="margin:0 0 10px;font-size:14px;color:#aeb9ca;">Your one-time invite code</p>
            <div style="margin:0 0 24px;padding:18px;text-align:center;background:#1a2639;border:1px solid #d3ad3d;border-radius:10px;color:#ffd34e;font-size:24px;font-weight:bold;letter-spacing:3px;">${safeCode}</div>
            <p style="margin:0 0 24px;text-align:center;"><a href="${safeSignupUrl}" style="display:inline-block;padding:13px 24px;background:#5d82f5;border-radius:999px;color:#07101e;font-size:16px;font-weight:bold;text-decoration:none;">Create your account</a></p>
            <p style="margin:0;color:#aeb9ca;font-size:14px;line-height:1.6;">This invitation expires on <strong style="color:#d9e1ef;">${safeExpirationLabel} (UTC)</strong> and can only be used once.</p>
            <p style="margin:22px 0 0;color:#aeb9ca;font-size:14px;line-height:1.6;">If you did not expect this invitation, you can safely ignore this email.</p>
          </td></tr>
          <tr><td style="padding:18px 32px;background:#0f1724;color:#7f8da3;font-size:12px;line-height:1.5;">The Theta-Space team</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

async function sendInviteEmail(recipientEmail: string, code: string, expiresAt: Date) {
  await sendSmtpMail({
    to: recipientEmail,
    subject: "You’re invited to Theta-Space",
    text: inviteEmailText(code, expiresAt),
    html: inviteEmailHtml(code, expiresAt)
  });
}

export async function listFreeAccountInviteAdminView() {
  const invites = await prisma.freeAccountInviteCode.findMany({
    where: {
      usedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() }
    },
    orderBy: { createdAt: "desc" },
    take: 25,
    include: {
      assignedUser: { select: { email: true, username: true, profile: { select: { displayName: true } } } },
      generatedBy: { select: { email: true, username: true, profile: { select: { displayName: true } } } },
      usedBy: { select: { email: true, username: true, profile: { select: { displayName: true } } } }
    }
  });

  return invites.map((invite) => ({
    id: invite.id,
    codePreview: invite.codePreview,
    recipientEmail: invite.recipientEmail,
    assignedUserLabel: userLabel(invite.assignedUser),
    generatedByUserLabel: userLabel(invite.generatedBy),
    usedByUserLabel: userLabel(invite.usedBy),
    emailedAt: invite.emailedAt?.toISOString() ?? null,
    usedAt: invite.usedAt?.toISOString() ?? null,
    expiresAt: invite.expiresAt.toISOString(),
    revokedAt: invite.revokedAt?.toISOString() ?? null,
    createdAt: invite.createdAt.toISOString()
  }));
}

export async function listOwnFreeAccountInvites(userId: string) {
  const invites = await prisma.freeAccountInviteCode.findMany({
    where: {
      generatedByUserId: userId,
      usedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() }
    },
    orderBy: { createdAt: "desc" },
    take: 10
  });

  return invites.map((invite) => ({
    id: invite.id,
    codePreview: invite.codePreview,
    recipientEmail: invite.recipientEmail,
    emailedAt: invite.emailedAt?.toISOString() ?? null,
    usedAt: invite.usedAt?.toISOString() ?? null,
    expiresAt: invite.expiresAt.toISOString(),
    revokedAt: invite.revokedAt?.toISOString() ?? null,
    createdAt: invite.createdAt.toISOString()
  }));
}

async function canGenerateMemberInvite(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      membership: true,
      membershipOverrides: {
        where: {
          featureKey: "invites.send",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
        }
      }
    }
  });

  if (!user) return false;
  if (isAdminRole(user.role)) return true;
  const override = user.membershipOverrides[0];
  if (override) return override.allowed;

  return tierPolicies[user.membership?.tier ?? "FREE"].features["invites.send"];
}

export async function createMemberFreeAccountInviteCode(actorUserId: string, input: unknown) {
  if (!(await canGenerateMemberInvite(actorUserId))) {
    return { ok: false as const, error: "Invite permission is not available on this account." };
  }

  const parsed = generateInviteSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid invite request." };
  }

  const recipientEmail = normalizeOptionalEmail(parsed.data.recipientEmail);

  if (parsed.data.sendEmail && !recipientEmail) {
    return { ok: false as const, error: "Enter an email address before sending the invite code." };
  }

  const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000);
  let code = createInviteCode();
  let codeHash = hashFreeAccountInviteCode(code);

  for (let attempts = 0; attempts < 3; attempts += 1) {
    const existing = await prisma.freeAccountInviteCode.findUnique({ where: { codeHash }, select: { id: true } });
    if (!existing) break;
    code = createInviteCode();
    codeHash = hashFreeAccountInviteCode(code);
  }

  const invite = await prisma.freeAccountInviteCode.create({
    data: {
      codeHash,
      codePreview: previewCode(code),
      recipientEmail,
      generatedByUserId: actorUserId,
      expiresAt
    }
  });

  let emailed = false;
  let emailError: string | undefined;

  if (parsed.data.sendEmail && recipientEmail) {
    try {
      await sendInviteEmail(recipientEmail, code, expiresAt);
      await prisma.freeAccountInviteCode.update({
        where: { id: invite.id },
        data: { emailedAt: new Date() }
      });
      emailed = true;
    } catch (error) {
      emailError = error instanceof Error ? error.message : "Could not send SMTP email.";
      await diagnostics.warn(MODULE_KEY, "Member invite SMTP send failed.", {
        inviteId: invite.id,
        recipientEmail,
        error: emailError
      });
    }
  }

  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "member-free-invite.generated",
    targetType: "FreeAccountInviteCode",
    targetId: invite.id,
    severity: AuditSeverity.info,
    metadata: {
      recipientEmail,
      expiresAt: expiresAt.toISOString(),
      emailed
    }
  });

  return {
    ok: true as const,
    invite: {
      id: invite.id,
      codePreview: invite.codePreview,
      recipientEmail: invite.recipientEmail,
      emailedAt: emailed ? new Date().toISOString() : null,
      usedAt: null,
      expiresAt: invite.expiresAt.toISOString(),
      revokedAt: null,
      createdAt: invite.createdAt.toISOString()
    },
    inviteCode: normalizeFreeAccountInviteCode(code),
    emailed,
    emailError
  };
}

export async function createFreeAccountInviteCode(actorUserId: string, input: unknown) {
  if (!(await isAdminUser(actorUserId))) {
    return { ok: false as const, error: "Admin access required." };
  }

  const parsed = generateInviteSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid invite request." };
  }

  const recipientEmail = normalizeOptionalEmail(parsed.data.recipientEmail);

  if (parsed.data.sendEmail && !recipientEmail) {
    return { ok: false as const, error: "Enter an email address before sending the invite code." };
  }

  const assignedUser = await findUserByIdentifier(parsed.data.assignedUserIdentifier);

  if (parsed.data.assignedUserIdentifier?.trim() && !assignedUser) {
    return { ok: false as const, error: "Assigned account was not found." };
  }

  const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000);
  let code = createInviteCode();
  let codeHash = hashFreeAccountInviteCode(code);

  for (let attempts = 0; attempts < 3; attempts += 1) {
    const existing = await prisma.freeAccountInviteCode.findUnique({ where: { codeHash }, select: { id: true } });
    if (!existing) break;
    code = createInviteCode();
    codeHash = hashFreeAccountInviteCode(code);
  }

  const invite = await prisma.freeAccountInviteCode.create({
    data: {
      codeHash,
      codePreview: previewCode(code),
      recipientEmail,
      assignedUserId: assignedUser?.id,
      generatedByUserId: actorUserId,
      expiresAt
    }
  });

  let emailed = false;
  let emailError: string | undefined;

  if (parsed.data.sendEmail && recipientEmail) {
    try {
      await sendInviteEmail(recipientEmail, code, expiresAt);
      await prisma.freeAccountInviteCode.update({
        where: { id: invite.id },
        data: { emailedAt: new Date() }
      });
      emailed = true;
    } catch (error) {
      emailError = error instanceof Error ? error.message : "Could not send SMTP email.";
      await diagnostics.warn(MODULE_KEY, "Free account invite SMTP send failed.", {
        inviteId: invite.id,
        recipientEmail,
        error: emailError
      });
    }
  }

  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "free-invite.generated",
    targetType: "FreeAccountInviteCode",
    targetId: invite.id,
    severity: AuditSeverity.warning,
    metadata: {
      recipientEmail,
      assignedUserId: assignedUser?.id ?? null,
      expiresAt: expiresAt.toISOString(),
      emailed
    }
  });

  return {
    ok: true as const,
    invite: {
      id: invite.id,
      codePreview: invite.codePreview,
      recipientEmail: invite.recipientEmail,
      assignedUserLabel: userLabel(assignedUser),
      generatedByUserLabel: null,
      usedByUserLabel: null,
      emailedAt: emailed ? new Date().toISOString() : null,
      usedAt: null,
      expiresAt: invite.expiresAt.toISOString(),
      revokedAt: null,
      createdAt: invite.createdAt.toISOString()
    },
    inviteCode: normalizeFreeAccountInviteCode(code),
    emailed,
    emailError
  };
}

export async function emailFreeAccountInviteCode(actorUserId: string, input: unknown) {
  if (!(await isAdminUser(actorUserId))) {
    return { ok: false as const, error: "Admin access required." };
  }

  const parsed = emailInviteSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid email request." };
  }

  const invite = await prisma.freeAccountInviteCode.findUnique({
    where: { codeHash: hashFreeAccountInviteCode(parsed.data.inviteCode) }
  });

  if (!invite || invite.usedAt || invite.revokedAt || invite.expiresAt <= new Date()) {
    return { ok: false as const, error: "Invite code is invalid, expired, revoked, or already used." };
  }

  const recipientEmail = normalizeOptionalEmail(parsed.data.recipientEmail);

  try {
    await sendInviteEmail(recipientEmail!, parsed.data.inviteCode, invite.expiresAt);
  } catch (error) {
    await diagnostics.warn(MODULE_KEY, "Free account invite SMTP resend failed.", {
      inviteId: invite.id,
      recipientEmail,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { ok: false as const, error: "Could not send invite email through SMTP." };
  }

  await prisma.freeAccountInviteCode.update({
    where: { id: invite.id },
    data: {
      recipientEmail,
      emailedAt: new Date()
    }
  });

  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "free-invite.emailed",
    targetType: "FreeAccountInviteCode",
    targetId: invite.id,
    severity: AuditSeverity.info,
    metadata: { recipientEmail }
  });

  return { ok: true as const };
}

export async function applyFreeAccountInviteCodeToAccount(actorUserId: string, input: unknown) {
  if (!(await isAdminUser(actorUserId))) {
    return { ok: false as const, error: "Admin access required." };
  }

  const parsed = applyInviteSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid invite assignment." };
  }

  const [invite, user] = await Promise.all([
    prisma.freeAccountInviteCode.findUnique({
      where: { codeHash: hashFreeAccountInviteCode(parsed.data.inviteCode) }
    }),
    findUserByIdentifier(parsed.data.userIdentifier)
  ]);

  if (!invite || invite.usedAt || invite.revokedAt || invite.expiresAt <= new Date()) {
    return { ok: false as const, error: "Invite code is invalid, expired, revoked, or already used." };
  }

  if (!user) {
    return { ok: false as const, error: "Account was not found." };
  }

  await prisma.freeAccountInviteCode.update({
    where: { id: invite.id },
    data: { assignedUserId: user.id }
  });

  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "free-invite.assigned",
    targetType: "User",
    targetId: user.id,
    severity: AuditSeverity.warning,
    metadata: { inviteId: invite.id }
  });

  return { ok: true as const, userLabel: userLabel(user) };
}

export async function revokeOwnFreeAccountInviteCode(actorUserId: string, input: unknown) {
  const parsed = revokeInviteSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid invite revoke request." };
  }

  const invite = await prisma.freeAccountInviteCode.findFirst({
    where: {
      id: parsed.data.inviteId,
      generatedByUserId: actorUserId
    }
  });

  if (!invite) {
    return { ok: false as const, error: "Invite code was not found." };
  }

  if (invite.usedAt) {
    return { ok: false as const, error: "Used invite codes cannot be revoked." };
  }

  if (invite.revokedAt) {
    return { ok: false as const, error: "Invite code was already revoked." };
  }

  await prisma.freeAccountInviteCode.update({
    where: { id: invite.id },
    data: { revokedAt: new Date() }
  });

  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "member-free-invite.revoked",
    targetType: "FreeAccountInviteCode",
    targetId: invite.id,
    severity: AuditSeverity.info
  });

  return { ok: true as const };
}

export async function findUsableFreeInviteForSignup(
  tx: Prisma.TransactionClient,
  inviteCode: string | undefined,
  email: string
) {
  if (!inviteCode?.trim()) {
    return { ok: false as const, error: "Invite code is required." };
  }

  const invite = await tx.freeAccountInviteCode.findUnique({
    where: { codeHash: hashFreeAccountInviteCode(inviteCode) },
    select: {
      id: true,
      recipientEmail: true,
      usedAt: true,
      revokedAt: true,
      expiresAt: true
    }
  });

  if (!invite || invite.usedAt || invite.revokedAt || invite.expiresAt <= new Date()) {
    return { ok: false as const, error: "Invite code is invalid, expired, revoked, or already used." };
  }

  if (invite.recipientEmail && invite.recipientEmail.toLowerCase() !== email.toLowerCase()) {
    return { ok: false as const, error: "Invite code is assigned to a different email address." };
  }

  return { ok: true as const, invite };
}

export async function consumeFreeInviteForSignup(
  tx: Prisma.TransactionClient,
  input: { inviteId: string; userId: string; email: string }
) {
  const update = await tx.freeAccountInviteCode.updateMany({
    where: {
      id: input.inviteId,
      usedAt: null,
      usedByUserId: null,
      revokedAt: null,
      expiresAt: { gt: new Date() }
    },
    data: {
      usedAt: new Date(),
      usedByUserId: input.userId,
      recipientEmail: input.email
    }
  });

  if (update.count !== 1) {
    throw new FreeInviteError("Invite code was already used.");
  }
}
