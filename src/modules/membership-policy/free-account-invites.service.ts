import { createHash, randomBytes } from "crypto";
import { AuditSeverity, Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { sendSmtpMail } from "@/lib/platform/smtp";

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

async function isAdminUser(userId?: string) {
  if (!userId) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  return user?.role === UserRole.ADMIN;
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

function inviteEmailText(code: string) {
  return [
    "You have been invited to create a free Theta-Space account.",
    "",
    `Invite code: ${normalizeFreeAccountInviteCode(code)}`,
    "",
    "Use this code during signup. This code can only be used once."
  ].join("\n");
}

async function sendInviteEmail(recipientEmail: string, code: string) {
  await sendSmtpMail({
    to: recipientEmail,
    subject: "Your Theta-Space invite code",
    text: inviteEmailText(code),
    html: `<p>You have been invited to create a free Theta-Space account.</p><p><strong>Invite code:</strong> ${normalizeFreeAccountInviteCode(code)}</p><p>Use this code during signup. This code can only be used once.</p>`
  });
}

export async function listFreeAccountInviteAdminView() {
  const invites = await prisma.freeAccountInviteCode.findMany({
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
      await sendInviteEmail(recipientEmail, code);
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
    await sendInviteEmail(recipientEmail!, parsed.data.inviteCode);
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
