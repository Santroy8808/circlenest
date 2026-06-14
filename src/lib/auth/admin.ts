import { prisma } from "@/lib/db/prisma";
import { canBeSiteModerator, resolveUserAccessPolicy } from "@/lib/policy/tier-policy";

const BOOTSTRAP_ADMIN_EMAILS = new Set([
  "mavnetllc@gmail.com",
  "julianne.dearmon@gmail.com",
]);

let bootstrapAdminsSyncPromise: Promise<void> | null = null;
let bootstrapAdminsSynced = false;

export const MANAGED_SUBSCRIPTION_TIERS = ["FREE", "CONTRIBUTOR", "PRO", "AUDITOR"] as const;
export type ManagedSubscriptionTier = (typeof MANAGED_SUBSCRIPTION_TIERS)[number];
export const SITE_MODERATOR_ASSIGNMENT_STATUSES = ["PENDING", "ACTIVE", "REVOKED"] as const;
export type SiteModeratorAssignmentStatus = (typeof SITE_MODERATOR_ASSIGNMENT_STATUSES)[number];

function normalizeEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function isGlobalAdminEmail(email: string | null | undefined) {
  return BOOTSTRAP_ADMIN_EMAILS.has(normalizeEmail(email));
}

export function normalizeManagedSubscriptionTier(value: string | null | undefined): ManagedSubscriptionTier | null {
  const normalized = (value ?? "").trim().toUpperCase();
  if (normalized === "FREE" || normalized === "CONTRIBUTOR" || normalized === "PRO" || normalized === "AUDITOR") return normalized;
  if (normalized === "BUSINESS" || normalized === "SILVER") return "CONTRIBUTOR";
  if (normalized === "GOLD" || normalized === "DIAMOND") return "PRO";
  return null;
}

export async function logAdminAction(entry: {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  note?: string | null;
}) {
  return prisma.moderatorActionLog.create({
    data: {
      actorUserId: entry.actorUserId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      note: entry.note ?? null,
    },
  });
}

export async function isAdminUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true },
  });
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  return BOOTSTRAP_ADMIN_EMAILS.has(normalizeEmail(user.email));
}

export async function isGlobalAdminUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
    },
  });
  if (!user) return false;
  return isGlobalAdminEmail(user.email);
}

export async function isSiteModeratorUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      role: true,
      subscriptionTier: true,
      siteModeratorAssignments: {
        select: {
          status: true,
        },
        take: 1,
      },
    },
  });
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  if (!canBeSiteModerator(resolveUserAccessPolicy(user))) return false;
  return user.siteModeratorAssignments.some((assignment) => assignment.status === "ACTIVE");
}

export async function canUserBeSiteModerator(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, subscriptionTier: true },
  });
  if (!user) return false;
  if (user.role === "ADMIN") return false;
  return canBeSiteModerator(resolveUserAccessPolicy(user));
}

export async function ensureBootstrapAdmins() {
  if (bootstrapAdminsSynced) return;
  if (bootstrapAdminsSyncPromise) return bootstrapAdminsSyncPromise;
  bootstrapAdminsSyncPromise = (async () => {
    const bootstrapUsers = await prisma.user.findMany({
      where: { email: { in: Array.from(BOOTSTRAP_ADMIN_EMAILS) } },
      select: { id: true, role: true },
    });
    if (!bootstrapUsers.every((user) => user.role === "ADMIN")) {
      await prisma.user.updateMany({
        where: { email: { in: Array.from(BOOTSTRAP_ADMIN_EMAILS) } },
        data: { role: "ADMIN" },
      });
    }
    bootstrapAdminsSynced = true;
  })().finally(() => {
    bootstrapAdminsSyncPromise = null;
  });
  return bootstrapAdminsSyncPromise;
}

export async function promoteAdminByEmail(email: string, adminPasswordHash: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return prisma.user.update({
    where: { email: normalized },
    data: { role: "ADMIN", adminPasswordHash, adminPasswordUpdatedAt: new Date() },
    select: { id: true, email: true, username: true, role: true, adminPasswordUpdatedAt: true },
  });
}

