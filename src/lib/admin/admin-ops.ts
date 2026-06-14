import { prisma } from "@/lib/db/prisma";
import { logAdminAction } from "@/lib/auth/admin";
import { randomToken, sha256 } from "@/lib/security/tokens";
import { sendEmailVerificationEmail } from "@/lib/email/smtp";
import { CURRENT_TERMS_VERSION } from "@/lib/security/terms";

export const ADMIN_MONEY_BOUNDARY =
  "Admins may grant platform-only credits, but real money must originate from payment processors and withdrawals must remain processor-backed.";

function publicBaseUrl() {
  return (process.env.NEXTAUTH_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function revokeUserSessions(input: { actorUserId: string; targetUserId: string; reason?: string | null }) {
  const updated = await prisma.user.update({
    where: { id: input.targetUserId },
    data: { sessionVersion: { increment: 1 } },
    select: { id: true, email: true, username: true },
  });
  await prisma.authSecurityEvent.create({
    data: {
      userId: updated.id,
      eventType: "ADMIN_SESSION_REVOKED",
      metadata: JSON.stringify({ reason: input.reason ?? null, actorUserId: input.actorUserId }),
    },
  });
  await logAdminAction({
    actorUserId: input.actorUserId,
    action: "REVOKE_USER_SESSIONS",
    targetType: "USER",
    targetId: updated.id,
    note: input.reason ?? updated.username ?? updated.email,
  });
  return updated;
}

export async function suspendUserAccount(input: { actorUserId: string; targetUserId: string; reason?: string | null }) {
  const updated = await prisma.user.update({
    where: { id: input.targetUserId },
    data: {
      deactivatedAt: new Date(),
      sessionVersion: { increment: 1 },
    },
    select: { id: true, email: true, username: true },
  });
  await prisma.authSecurityEvent.create({
    data: {
      userId: updated.id,
      eventType: "ADMIN_ACCOUNT_SUSPENDED",
      metadata: JSON.stringify({ reason: input.reason ?? null, actorUserId: input.actorUserId }),
    },
  });
  await logAdminAction({
    actorUserId: input.actorUserId,
    action: "SUSPEND_USER_ACCOUNT",
    targetType: "USER",
    targetId: updated.id,
    note: input.reason ?? updated.username ?? updated.email,
  });
  return updated;
}

export async function restoreSuspendedUserAccount(input: { actorUserId: string; targetUserId: string; reason?: string | null }) {
  const updated = await prisma.user.update({
    where: { id: input.targetUserId },
    data: {
      deactivatedAt: null,
      deletionRequestedAt: null,
      sessionVersion: { increment: 1 },
    },
    select: { id: true, email: true, username: true },
  });
  await prisma.authSecurityEvent.create({
    data: {
      userId: updated.id,
      eventType: "ADMIN_ACCOUNT_RESTORED",
      metadata: JSON.stringify({ reason: input.reason ?? null, actorUserId: input.actorUserId }),
    },
  });
  await logAdminAction({
    actorUserId: input.actorUserId,
    action: "RESTORE_USER_ACCOUNT",
    targetType: "USER",
    targetId: updated.id,
    note: input.reason ?? updated.username ?? updated.email,
  });
  return updated;
}

export async function resetUserTwoFactor(input: { actorUserId: string; targetUserId: string; reason?: string | null }) {
  const deleted = await prisma.twoFactorConfig.deleteMany({ where: { userId: input.targetUserId } });
  await prisma.user.update({
    where: { id: input.targetUserId },
    data: { sessionVersion: { increment: 1 } },
  });
  await prisma.authSecurityEvent.create({
    data: {
      userId: input.targetUserId,
      eventType: "ADMIN_2FA_RESET",
      metadata: JSON.stringify({ reason: input.reason ?? null, actorUserId: input.actorUserId, deleted: deleted.count }),
    },
  });
  await logAdminAction({
    actorUserId: input.actorUserId,
    action: "RESET_USER_2FA",
    targetType: "USER",
    targetId: input.targetUserId,
    note: input.reason ?? `Deleted configs: ${deleted.count}`,
  });
  return deleted.count;
}

export async function resendEmailVerification(input: { actorUserId: string; targetUserId: string }) {
  const target = await prisma.user.findUnique({
    where: { id: input.targetUserId },
    select: { id: true, email: true, username: true },
  });
  if (!target) return null;

  const token = randomToken(24);
  await prisma.$transaction([
    prisma.emailVerificationToken.deleteMany({ where: { userId: target.id } }),
    prisma.emailVerificationToken.create({
      data: {
        userId: target.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
    }),
    prisma.authSecurityEvent.create({
      data: {
        userId: target.id,
        eventType: "EMAIL_VERIFICATION_RESENT",
        metadata: JSON.stringify({ actorUserId: input.actorUserId }),
      },
    }),
  ]);

  let emailSent = false;
  try {
    await sendEmailVerificationEmail(target.email, `${publicBaseUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}`);
    emailSent = true;
  } catch (error) {
    console.error("[admin ops] email verification resend failed", {
      userId: target.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  await logAdminAction({
    actorUserId: input.actorUserId,
    action: "RESEND_EMAIL_VERIFICATION",
    targetType: "USER",
    targetId: target.id,
    note: `${target.username ?? target.email} emailSent=${emailSent}`,
  });
  return target;
}

export async function forceTermsAcceptance(input: { actorUserId: string; targetUserId?: string | null; reason?: string | null }) {
  const where = input.targetUserId ? { id: input.targetUserId } : {};
  const result = await prisma.user.updateMany({
    where,
    data: {
      acceptedTermsVersion: null,
      acceptedTermsAt: null,
      sessionVersion: { increment: 1 },
    },
  });
  await logAdminAction({
    actorUserId: input.actorUserId,
    action: input.targetUserId ? "FORCE_TERMS_ACCEPTANCE_USER" : "FORCE_TERMS_ACCEPTANCE_ALL",
    targetType: input.targetUserId ? "USER" : "TERMS",
    targetId: input.targetUserId ?? CURRENT_TERMS_VERSION,
    note: input.reason ?? `Terms version ${CURRENT_TERMS_VERSION}`,
  });
  return result.count;
}

export async function upsertFeatureFlag(input: { actorUserId: string; key: string; enabled: boolean; description?: string | null }) {
  const key = normalizeSlug(input.key).replace(/-/g, "_").toUpperCase();
  if (!key) return null;
  const flag = await prisma.platformFeatureFlag.upsert({
    where: { key },
    update: { enabled: input.enabled, description: input.description ?? null, updatedById: input.actorUserId },
    create: { key, enabled: input.enabled, description: input.description ?? null, updatedById: input.actorUserId },
  });
  await logAdminAction({
    actorUserId: input.actorUserId,
    action: "UPSERT_FEATURE_FLAG",
    targetType: "FEATURE_FLAG",
    targetId: flag.key,
    note: `${flag.enabled ? "enabled" : "disabled"} ${flag.description ?? ""}`.trim(),
  });
  return flag;
}

export async function upsertPlatformCategory(input: { actorUserId: string; area: string; name: string; isActive: boolean; sortOrder: number }) {
  const area = normalizeSlug(input.area).toUpperCase();
  const name = input.name.trim().slice(0, 120);
  const slug = normalizeSlug(name);
  if (!area || !name || !slug) return null;
  const category = await prisma.platformCategory.upsert({
    where: { area_slug: { area, slug } },
    update: { name, isActive: input.isActive, sortOrder: Math.trunc(input.sortOrder), updatedById: input.actorUserId },
    create: { area, name, slug, isActive: input.isActive, sortOrder: Math.trunc(input.sortOrder), updatedById: input.actorUserId },
  });
  await logAdminAction({
    actorUserId: input.actorUserId,
    action: "UPSERT_PLATFORM_CATEGORY",
    targetType: "PLATFORM_CATEGORY",
    targetId: `${area}:${slug}`,
    note: `${name} ${category.isActive ? "active" : "inactive"}`,
  });
  return category;
}

export async function recordPlatformAnnouncement(input: {
  actorUserId: string;
  headline: string;
  body: string;
  targetUrl?: string | null;
  audienceType: string;
  audienceValueJson?: string | null;
  deliveryModesJson?: string | null;
  publish: boolean;
}) {
  const announcement = await prisma.platformAnnouncement.create({
    data: {
      actorUserId: input.actorUserId,
      headline: input.headline.trim().slice(0, 180),
      body: input.body.trim().slice(0, 4000),
      targetUrl: input.targetUrl?.trim() || null,
      audienceType: input.audienceType.trim().toUpperCase() || "GLOBAL",
      audienceValueJson: input.audienceValueJson?.trim() || null,
      deliveryModesJson: input.deliveryModesJson?.trim() || null,
      status: input.publish ? "PUBLISHED" : "DRAFT",
      publishedAt: input.publish ? new Date() : null,
    },
  });
  await logAdminAction({
    actorUserId: input.actorUserId,
    action: input.publish ? "PUBLISH_PLATFORM_ANNOUNCEMENT" : "SAVE_PLATFORM_ANNOUNCEMENT",
    targetType: "PLATFORM_ANNOUNCEMENT",
    targetId: announcement.id,
    note: announcement.headline,
  });
  return announcement;
}

export async function addSupportNote(input: { actorUserId: string; targetType: string; targetId: string; body: string }) {
  const note = await prisma.adminSupportNote.create({
    data: {
      authorUserId: input.actorUserId,
      targetType: input.targetType.trim().toUpperCase(),
      targetId: input.targetId.trim(),
      body: input.body.trim().slice(0, 4000),
    },
  });
  await logAdminAction({
    actorUserId: input.actorUserId,
    action: "ADD_SUPPORT_NOTE",
    targetType: note.targetType,
    targetId: note.targetId,
    note: note.body.slice(0, 240),
  });
  return note;
}

export async function queueWebhookReplay(input: { actorUserId: string; provider: string; eventId: string; payloadSummary?: string | null }) {
  const replay = await prisma.webhookReplayRequest.create({
    data: {
      requestedById: input.actorUserId,
      provider: input.provider.trim().toUpperCase(),
      eventId: input.eventId.trim(),
      payloadSummary: input.payloadSummary?.trim() || null,
    },
  });
  await logAdminAction({
    actorUserId: input.actorUserId,
    action: "QUEUE_WEBHOOK_REPLAY",
    targetType: "WEBHOOK_EVENT",
    targetId: `${replay.provider}:${replay.eventId}`,
    note: "Queued only; replay processor must verify provider signature and idempotency.",
  });
  return replay;
}

export async function createDataPrivacyRequest(input: {
  actorUserId: string;
  requesterId?: string | null;
  requesterEmail?: string | null;
  requestType: string;
  notes?: string | null;
}) {
  const request = await prisma.dataPrivacyRequest.create({
    data: {
      requesterId: input.requesterId?.trim() || null,
      requesterEmail: input.requesterEmail?.trim().toLowerCase() || null,
      requestType: input.requestType.trim().toUpperCase(),
      notes: input.notes?.trim() || null,
      handledById: input.actorUserId,
    },
  });
  await logAdminAction({
    actorUserId: input.actorUserId,
    action: "CREATE_DATA_PRIVACY_REQUEST",
    targetType: "DATA_PRIVACY_REQUEST",
    targetId: request.id,
    note: request.requestType,
  });
  return request;
}

export async function updateBusinessVerification(input: {
  actorUserId: string;
  businessProfileId: string;
  status: string;
  verificationStatus: string;
  note?: string | null;
}) {
  const verificationStatus = input.verificationStatus.trim().toUpperCase();
  const status = input.status.trim().toUpperCase();
  const updated = await prisma.businessProfile.update({
    where: { id: input.businessProfileId },
    data: {
      status,
      verificationStatus,
      verificationNotes: input.note?.trim() || null,
      verifiedAt: verificationStatus === "APPROVED" ? new Date() : null,
      heldAt: status === "HOLD" ? new Date() : null,
      storefrontEnabled: verificationStatus === "APPROVED" && status === "ACTIVE" ? undefined : false,
    },
    select: { id: true, businessName: true, status: true, verificationStatus: true },
  });
  await logAdminAction({
    actorUserId: input.actorUserId,
    action: "UPDATE_BUSINESS_VERIFICATION",
    targetType: "BUSINESS_PROFILE",
    targetId: updated.id,
    note: `${updated.businessName}: ${status}/${verificationStatus}${input.note ? ` - ${input.note}` : ""}`,
  });
  return updated;
}

export async function resolveContentReport(input: {
  actorUserId: string;
  reportId: string;
  status: string;
  resolution?: string | null;
  assignToSelf?: boolean;
}) {
  const status = input.status.trim().toUpperCase();
  const updated = await prisma.contentReport.update({
    where: { id: input.reportId },
    data: {
      status,
      assignedModeratorId: input.assignToSelf ? input.actorUserId : undefined,
      assignedAt: input.assignToSelf ? new Date() : undefined,
      reviewedById: ["RESOLVED", "DISMISSED", "REMOVED"].includes(status) ? input.actorUserId : undefined,
      reviewedAt: ["RESOLVED", "DISMISSED", "REMOVED"].includes(status) ? new Date() : undefined,
      resolution: input.resolution?.trim() || null,
    },
  });
  await logAdminAction({
    actorUserId: input.actorUserId,
    action: "UPDATE_CONTENT_REPORT",
    targetType: "CONTENT_REPORT",
    targetId: updated.id,
    note: `${updated.status}${updated.resolution ? ` - ${updated.resolution}` : ""}`,
  });
  return updated;
}

export async function updateAdCampaignAdminState(input: {
  actorUserId: string;
  campaignId: string;
  status?: string | null;
  manualAdminBoost?: number | null;
  manualAdminDemotion?: number | null;
  note?: string | null;
}) {
  const updated = await prisma.adCampaign.update({
    where: { id: input.campaignId },
    data: {
      status: input.status?.trim().toUpperCase() || undefined,
      manualAdminBoost: typeof input.manualAdminBoost === "number" ? Math.max(0, input.manualAdminBoost) : undefined,
      manualAdminDemotion: typeof input.manualAdminDemotion === "number" ? Math.max(0, input.manualAdminDemotion) : undefined,
    },
    select: { id: true, title: true, status: true, manualAdminBoost: true, manualAdminDemotion: true },
  });
  await logAdminAction({
    actorUserId: input.actorUserId,
    action: "UPDATE_AD_CAMPAIGN_ADMIN_STATE",
    targetType: "AD_CAMPAIGN",
    targetId: updated.id,
    note: input.note ?? `${updated.title}: ${updated.status} boost=${updated.manualAdminBoost} demote=${updated.manualAdminDemotion}`,
  });
  return updated;
}

export async function createPlatformThrottle(input: {
  actorUserId: string;
  targetType: string;
  targetId: string;
  throttleKey: string;
  reason?: string | null;
  expiresAt?: Date | null;
}) {
  const throttle = await prisma.platformThrottle.create({
    data: {
      actorUserId: input.actorUserId,
      targetType: input.targetType.trim().toUpperCase(),
      targetId: input.targetId.trim(),
      throttleKey: input.throttleKey.trim().toUpperCase(),
      reason: input.reason?.trim() || null,
      expiresAt: input.expiresAt ?? null,
    },
  });
  await logAdminAction({
    actorUserId: input.actorUserId,
    action: "CREATE_PLATFORM_THROTTLE",
    targetType: throttle.targetType,
    targetId: throttle.targetId,
    note: `${throttle.throttleKey}${throttle.reason ? ` - ${throttle.reason}` : ""}`,
  });
  return throttle;
}
