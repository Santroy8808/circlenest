import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { AuditSeverity, BulkInviteBatchStatus, PlatformJobStatus, Prisma, type PlatformJob } from "@prisma/client";
import { z } from "zod";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { isAdminRole } from "@/lib/platform/roles";
import { isFeatureEnabled } from "@/modules/feature-flags/feature-flags.service";
import { sendPlatformMail } from "@/lib/platform/mail";
import { readPlatformEnv } from "@/lib/platform/env";
import { tierPolicies } from "@/modules/membership-policy/policy";

const MODULE_KEY = "free-account-invites";
const BULK_INVITE_JOB_KIND = "membership.bulk-invite-email";
const BULK_INVITE_DAILY_CAP = 300;
const BULK_INVITE_MAX_ADDRESSES = 250;
const BULK_INVITE_INTERVAL_MS = 2 * 60 * 1000;

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

const bulkInviteSchema = z.object({
  emails: z.string().trim().min(1).max(100_000),
  expiresInDays: z.coerce.number().int().min(1).max(90).default(7)
});

const bulkEmailPattern = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+/gi;

export function parseBulkInviteEmails(value: string) {
  const matches = value.match(bulkEmailPattern) ?? [];
  const emails = [...new Set(matches.map((email) => normalizeOptionalEmail(email)).filter((email): email is string => Boolean(email)))];
  return {
    emails,
    extractedCount: emails.length,
    duplicateCount: Math.max(0, matches.length - emails.length)
  };
}

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
    "THETA-SPACE — PRIVATE INVITATION",
    "================================",
    "",
    "You’re invited to join Theta-Space, a private community for thoughtful connection, communication, and shared discovery.",
    "",
    "YOUR ONE-TIME INVITE CODE",
    normalizedCode,
    "",
    "To accept your invitation:",
    `1. Visit ${signupUrl}`,
    "2. Enter the invite code shown above.",
    "3. Create your account and verify your email address.",
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
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="dark">
    <meta name="supported-color-schemes" content="dark">
    <title>You’re invited to Theta-Space</title>
    <style>
      @media only screen and (max-width: 640px) {
        .theta-shell { padding: 18px 10px !important; }
        .theta-card-cell { padding-left: 22px !important; padding-right: 22px !important; }
        .theta-title { font-size: 30px !important; }
        .theta-code { font-size: 20px !important; letter-spacing: 2px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:#080b10;color:#dbe2ee;font-family:Inter,'Segoe UI',Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Your private Theta-Space invitation and one-time signup code are inside.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#080b10;">
      <tr>
        <td align="center" class="theta-shell" style="padding:38px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:620px;background-color:#111824;border:1px solid #334159;border-radius:18px;overflow:hidden;">
            <tr>
              <td class="theta-card-cell" style="padding:28px 34px;background-color:#0d131d;border-bottom:1px solid #334159;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td width="54" valign="middle">
                      <div style="width:46px;height:46px;line-height:46px;text-align:center;border:1px solid #ffd85f;border-radius:50%;background-color:#172133;color:#ffd85f;font-size:16px;font-weight:800;letter-spacing:-1px;">TS</div>
                    </td>
                    <td valign="middle" style="padding-left:12px;">
                      <div style="color:#ffd85f;font-size:14px;font-weight:800;letter-spacing:3px;line-height:1.2;">THETA-SPACE</div>
                      <div style="margin-top:5px;color:#aab4c3;font-size:12px;letter-spacing:1px;">PRIVATE MEMBER COMMUNITY</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="theta-card-cell" style="padding:38px 34px 34px;">
                <div style="margin:0 0 12px;color:#6d91ff;font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Private invitation</div>
                <h1 class="theta-title" style="margin:0;color:#f4f7fc;font-size:36px;line-height:1.15;font-weight:750;">You’re invited.</h1>
                <p style="margin:20px 0 26px;color:#c5cfdd;font-size:16px;line-height:1.7;">You’ve been invited to join Theta-Space, a private community for thoughtful connection, communication, and shared discovery.</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 26px;background-color:#172133;border:1px solid #766b45;border-radius:12px;">
                  <tr>
                    <td align="center" style="padding:16px 18px 7px;color:#aab4c3;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Your one-time invite code</td>
                  </tr>
                  <tr>
                    <td align="center" class="theta-code" style="padding:5px 18px 19px;color:#ffd85f;font-family:'Cascadia Mono',Consolas,'Courier New',monospace;font-size:25px;font-weight:800;letter-spacing:3px;">${safeCode}</td>
                  </tr>
                </table>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 28px;">
                  <tr>
                    <td align="center" bgcolor="#ffd85f" style="border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.24);">
                      <a href="${safeSignupUrl}" style="display:inline-block;padding:14px 28px;border:1px solid #ffd85f;border-radius:999px;color:#080b10;font-size:16px;font-weight:800;line-height:1;text-decoration:none;">Accept your invitation</a>
                    </td>
                  </tr>
                </table>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 24px;">
                  <tr>
                    <td width="28" valign="top" style="color:#6d91ff;font-size:15px;font-weight:800;line-height:1.7;">1.</td>
                    <td style="padding-bottom:8px;color:#c5cfdd;font-size:14px;line-height:1.7;">Open the secure signup page using the button above.</td>
                  </tr>
                  <tr>
                    <td width="28" valign="top" style="color:#6d91ff;font-size:15px;font-weight:800;line-height:1.7;">2.</td>
                    <td style="padding-bottom:8px;color:#c5cfdd;font-size:14px;line-height:1.7;">Enter your one-time invitation code.</td>
                  </tr>
                  <tr>
                    <td width="28" valign="top" style="color:#6d91ff;font-size:15px;font-weight:800;line-height:1.7;">3.</td>
                    <td style="color:#c5cfdd;font-size:14px;line-height:1.7;">Create your account and verify your email address.</td>
                  </tr>
                </table>

                <div style="height:1px;background-color:#334159;line-height:1px;">&nbsp;</div>
                <p style="margin:22px 0 8px;color:#aab4c3;font-size:13px;line-height:1.65;">This invitation expires on <strong style="color:#dbe2ee;">${safeExpirationLabel} (UTC)</strong> and can only be used once.</p>
                <p style="margin:0;color:#7f8da3;font-size:12px;line-height:1.65;">Button not working? Copy and paste this address into your browser:<br><a href="${safeSignupUrl}" style="color:#6d91ff;text-decoration:underline;word-break:break-all;">${safeSignupUrl}</a></p>
              </td>
            </tr>
            <tr>
              <td class="theta-card-cell" style="padding:20px 34px;background-color:#0d131d;border-top:1px solid #334159;color:#7f8da3;font-size:12px;line-height:1.6;">
                Sent by the Theta-Space team.<br>If you did not expect this invitation, you can safely ignore this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildFreeAccountInviteEmail(code: string, expiresAt: Date) {
  return {
    subject: "You’re invited to Theta-Space",
    text: inviteEmailText(code, expiresAt),
    html: inviteEmailHtml(code, expiresAt)
  };
}

async function sendInviteEmail(recipientEmail: string, code: string, expiresAt: Date) {
  const message = buildFreeAccountInviteEmail(code, expiresAt);
  const env = readPlatformEnv();
  await sendPlatformMail({
    to: recipientEmail,
    from: env.INVITE_MAIL_FROM ?? "invite@theta-space.net",
    replyTo: env.INVITE_MAIL_REPLY_TO ?? "support@theta-space.net",
    ...message
  });
}

function inviteDeliveryKey() {
  const env = readPlatformEnv();
  const secret = env.NEXTAUTH_SECRET;
  if (!secret) throw new FreeInviteError("NEXTAUTH_SECRET is required for queued invite delivery.");
  return createHash("sha256").update(`theta-space:bulk-invite:${secret}`).digest();
}

function sealInviteCode(code: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", inviteDeliveryKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((value) => value.toString("base64url")).join(".");
}

function unsealInviteCode(value: string) {
  const [ivValue, tagValue, ciphertextValue] = value.split(".");
  if (!ivValue || !tagValue || !ciphertextValue) throw new FreeInviteError("Queued invite delivery data is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", inviteDeliveryKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]).toString("utf8");
}

export async function listOwnBulkInviteBatches(userId: string) {
  const batches = await prisma.bulkInviteBatch.findMany({
    where: { createdByUserId: userId },
    orderBy: { createdAt: "desc" },
    take: 10
  });

  return batches.map((batch) => ({
    id: batch.id,
    requestedCount: batch.requestedCount,
    acceptedCount: batch.acceptedCount,
    skippedCount: batch.skippedCount,
    sentCount: batch.sentCount,
    failedCount: batch.failedCount,
    status: batch.status,
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString()
  }));
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
      usedBy: { select: { email: true, username: true, profile: { select: { displayName: true } } } },
      bulkBatch: { select: { id: true, status: true, sentCount: true, failedCount: true } }
    }
  });

  return invites.map((invite) => ({
    id: invite.id,
    codePreview: invite.codePreview,
    recipientEmail: invite.recipientEmail,
    assignedUserLabel: userLabel(invite.assignedUser),
    generatedByUserLabel: userLabel(invite.generatedBy),
    usedByUserLabel: userLabel(invite.usedBy),
    bulkBatchId: invite.bulkBatch?.id ?? null,
    bulkBatchStatus: invite.bulkBatch?.status ?? null,
    bulkBatchSentCount: invite.bulkBatch?.sentCount ?? null,
    bulkBatchFailedCount: invite.bulkBatch?.failedCount ?? null,
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

async function canGenerateBulkMemberInvites(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      membership: true,
      membershipOverrides: {
        where: {
          featureKey: "invites.bulkSend",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
        }
      }
    }
  });

  if (!user) return false;
  if (isAdminRole(user.role)) return true;
  const override = user.membershipOverrides[0];
  if (override) return override.allowed;

  return tierPolicies[user.membership?.tier ?? "FREE"].features["invites.bulkSend"];
}

export async function createBulkMemberInvites(actorUserId: string, input: unknown) {
  if (!(await isFeatureEnabled("membership.bulk_invites"))) {
    return { ok: false as const, error: "Bulk invitations are currently disabled by Platform Management." };
  }
  if (!(await canGenerateBulkMemberInvites(actorUserId))) {
    return { ok: false as const, error: "Bulk invite permission is not available on this account." };
  }

  const parsed = bulkInviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid bulk invite request." };
  }

  const parsedEmails = parseBulkInviteEmails(parsed.data.emails);
  if (parsedEmails.extractedCount === 0) {
    return { ok: false as const, error: "No valid email addresses were found." };
  }
  if (parsedEmails.extractedCount > BULK_INVITE_MAX_ADDRESSES) {
    return { ok: false as const, error: `Bulk invitations are limited to ${BULK_INVITE_MAX_ADDRESSES} addresses per batch.` };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000);
  let result: Awaited<ReturnType<typeof createBulkInviteBatchInTransaction>>;
  try {
    result = await createBulkInviteBatchInTransaction(actorUserId, parsedEmails, now, expiresAt);
  } catch (error) {
    return { ok: false as const, error: error instanceof FreeInviteError ? error.message : "Could not queue bulk invitations." };
  }

  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "member-free-invite.bulk-generated",
    targetType: "BulkInviteBatch",
    targetId: result.batch.id,
    severity: AuditSeverity.info,
    metadata: {
      requestedCount: result.batch.requestedCount,
      acceptedCount: result.batch.acceptedCount,
      skippedCount: result.skippedCount,
      dailyCap: BULK_INVITE_DAILY_CAP
    }
  });

  return {
    ok: true as const,
    batch: {
      id: result.batch.id,
      requestedCount: result.batch.requestedCount,
      acceptedCount: result.batch.acceptedCount,
      skippedCount: result.batch.skippedCount,
      sentCount: 0,
      failedCount: 0,
      status: result.batch.status,
      createdAt: result.batch.createdAt.toISOString(),
      updatedAt: result.batch.updatedAt.toISOString()
    },
    queuedCount: result.inviteIds.length,
    dailyCap: BULK_INVITE_DAILY_CAP,
    intervalMinutes: BULK_INVITE_INTERVAL_MS / 60_000
  };
}

async function createBulkInviteBatchInTransaction(
  actorUserId: string,
  parsedEmails: ReturnType<typeof parseBulkInviteEmails>,
  now: Date,
  expiresAt: Date
) {
  return prisma.$transaction(async (tx) => {
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const reservedToday = await tx.freeAccountInviteCode.count({
      where: { bulkBatchId: { not: null }, createdAt: { gte: dayStart } }
    });
    if (reservedToday + parsedEmails.extractedCount > BULK_INVITE_DAILY_CAP) {
      throw new FreeInviteError(`The daily bulk invitation limit is ${BULK_INVITE_DAILY_CAP} addresses. Try again tomorrow.`);
    }

    const existing = await tx.freeAccountInviteCode.findMany({
      where: {
        recipientEmail: { in: parsedEmails.emails },
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: now }
      },
      select: { recipientEmail: true }
    });
    const existingEmails = new Set(existing.map((invite) => invite.recipientEmail).filter((email): email is string => Boolean(email)));
    const acceptedEmails = parsedEmails.emails.filter((email) => !existingEmails.has(email));
    if (acceptedEmails.length === 0) {
      throw new FreeInviteError("Every address already has an active invitation or was duplicated.");
    }

    const latestJob = await tx.platformJob.findFirst({
      where: {
        kind: BULK_INVITE_JOB_KIND,
        status: { in: [PlatformJobStatus.PENDING, PlatformJobStatus.RUNNING] },
        runAfter: { gt: now }
      },
      orderBy: { runAfter: "desc" },
      select: { runAfter: true }
    });
    let runAfter = latestJob ? new Date(latestJob.runAfter.getTime() + BULK_INVITE_INTERVAL_MS) : new Date(now.getTime() + 60_000);
    const batch = await tx.bulkInviteBatch.create({
      data: {
        createdByUserId: actorUserId,
        requestedCount: parsedEmails.extractedCount,
        acceptedCount: acceptedEmails.length,
        skippedCount: parsedEmails.duplicateCount + existingEmails.size
      }
    });

    const inviteIds: string[] = [];
    for (const recipientEmail of acceptedEmails) {
      let code = createInviteCode();
      let codeHash = hashFreeAccountInviteCode(code);
      for (let attempts = 0; attempts < 3; attempts += 1) {
        const duplicate = await tx.freeAccountInviteCode.findUnique({ where: { codeHash }, select: { id: true } });
        if (!duplicate) break;
        code = createInviteCode();
        codeHash = hashFreeAccountInviteCode(code);
      }
      const invite = await tx.freeAccountInviteCode.create({
        data: {
          codeHash,
          codePreview: previewCode(code),
          recipientEmail,
          generatedByUserId: actorUserId,
          bulkBatchId: batch.id,
          deliveryCodeCiphertext: sealInviteCode(code),
          expiresAt
        }
      });
      inviteIds.push(invite.id);
      await tx.platformJob.create({
        data: {
          kind: BULK_INVITE_JOB_KIND,
          payload: { inviteId: invite.id },
          runAfter,
          maxAttempts: 3
        }
      });
      runAfter = new Date(runAfter.getTime() + BULK_INVITE_INTERVAL_MS);
    }

    return { batch, inviteIds, skippedCount: parsedEmails.duplicateCount + existingEmails.size };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createMemberFreeAccountInviteCode(actorUserId: string, input: unknown) {
  if (!(await isFeatureEnabled("membership.single_invites"))) {
    return { ok: false as const, error: "Single invitations are currently disabled by Platform Management." };
  }
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

async function recordBulkDeliveryOutcome(batchId: string, outcome: "sent" | "failed") {
  return prisma.$transaction(async (tx) => {
    const batch = await tx.bulkInviteBatch.update({
      where: { id: batchId },
      data: outcome === "sent" ? { sentCount: { increment: 1 } } : { failedCount: { increment: 1 } }
    });
    const completedCount = batch.sentCount + batch.failedCount;
    if (completedCount >= batch.acceptedCount) {
      return tx.bulkInviteBatch.update({
        where: { id: batchId },
        data: { status: batch.failedCount > 0 ? BulkInviteBatchStatus.PARTIAL : BulkInviteBatchStatus.COMPLETED }
      });
    }
    if (batch.status === BulkInviteBatchStatus.QUEUED) {
      return tx.bulkInviteBatch.update({ where: { id: batchId }, data: { status: BulkInviteBatchStatus.RUNNING } });
    }
    return batch;
  });
}

export async function deliverQueuedBulkInvite(job: PlatformJob) {
  const inviteId = typeof job.payload === "object" && job.payload && "inviteId" in job.payload && typeof job.payload.inviteId === "string"
    ? job.payload.inviteId
    : null;
  if (!inviteId) return { ok: false as const, error: "Bulk invite job is missing an invite id." };

  const invite = await prisma.freeAccountInviteCode.findUnique({
    where: { id: inviteId },
    select: {
      id: true,
      recipientEmail: true,
      expiresAt: true,
      usedAt: true,
      revokedAt: true,
      emailedAt: true,
      deliveryCodeCiphertext: true,
      bulkBatchId: true
    }
  });
  if (!invite || !invite.bulkBatchId) return { ok: true as const, result: { skipped: true, reason: "Invite not found." } };

  if (!invite.recipientEmail || invite.usedAt || invite.revokedAt || invite.expiresAt <= new Date() || invite.emailedAt || !invite.deliveryCodeCiphertext) {
    if (invite.deliveryCodeCiphertext && !invite.emailedAt) {
      await prisma.freeAccountInviteCode.update({ where: { id: invite.id }, data: { deliveryCodeCiphertext: null } });
      await recordBulkDeliveryOutcome(invite.bulkBatchId, "failed");
    }
    return { ok: true as const, result: { skipped: true, reason: "Invite is no longer deliverable." } };
  }

  const recipientEmail = invite.recipientEmail;
  const deliveryCodeCiphertext = invite.deliveryCodeCiphertext;

  try {
    const code = unsealInviteCode(deliveryCodeCiphertext);
    await sendInviteEmail(recipientEmail, code, invite.expiresAt);
    await prisma.freeAccountInviteCode.update({
      where: { id: invite.id },
      data: { emailedAt: new Date(), deliveryCodeCiphertext: null }
    });
    await recordBulkDeliveryOutcome(invite.bulkBatchId, "sent");
    return { ok: true as const, result: { sent: true, inviteId: invite.id } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send queued invite email.";
    if (job.attempts + 1 >= job.maxAttempts) {
      await prisma.freeAccountInviteCode.update({ where: { id: invite.id }, data: { deliveryCodeCiphertext: null } });
      await recordBulkDeliveryOutcome(invite.bulkBatchId, "failed");
    }
    await diagnostics.warn(MODULE_KEY, "Queued bulk invite SMTP send failed.", { inviteId: invite.id, error: message });
    return { ok: false as const, error: message };
  }
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
