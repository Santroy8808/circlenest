import { prisma } from "@/lib/platform/db";
import { asJson, createConductReference } from "@/modules/conduct-reporting/references";

export const CONDUCT_RESTRICTION_DAYS = [3, 7, 14, 30] as const;

export class ConductInteractionRestrictedError extends Error {
  readonly code = "CONDUCT_INTERACTION_RESTRICTED";
  constructor(readonly restrictedUntil: Date) {
    super(`Direct interaction is unavailable between these accounts until ${restrictedUntil.toISOString()}.`);
  }
}

export function canonicalConductPair(firstUserId: string, secondUserId: string) {
  if (!firstUserId || !secondUserId || firstUserId === secondUserId) throw new Error("Two different accounts are required.");
  return firstUserId < secondUserId
    ? { userLowId: firstUserId, userHighId: secondUserId }
    : { userLowId: secondUserId, userHighId: firstUserId };
}

export function nextConductRestrictionDays(currentDays: number | null, conflictFreeDays: number, decayDays = 30) {
  const levels = [...CONDUCT_RESTRICTION_DAYS];
  if (!currentDays) return levels[0];
  const index = Math.max(0, levels.indexOf(currentDays as (typeof levels)[number]));
  if (conflictFreeDays >= decayDays) return levels[Math.max(0, index - 1)];
  return levels[Math.min(levels.length - 1, index + 1)];
}

export async function applyPairwiseConductRestriction(input: {
  firstUserId: string;
  secondUserId: string;
  reason: string;
  createdByUserId?: string | null;
  requestedDays?: (typeof CONDUCT_RESTRICTION_DAYS)[number] | null;
  verifiedAt?: Date;
}) {
  const pair = canonicalConductPair(input.firstUserId, input.secondUserId);
  const now = input.verifiedAt ?? new Date();
  const config = await prisma.conductConfig.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
  const existing = await prisma.conductRestriction.findUnique({ where: { userLowId_userHighId: pair } });
  const conflictFreeDays = existing?.lastVerifiedConflictAt
    ? Math.floor((now.getTime() - existing.lastVerifiedConflictAt.getTime()) / 86_400_000)
    : Number.POSITIVE_INFINITY;
  const levelDays = input.requestedDays ?? nextConductRestrictionDays(existing?.levelDays ?? null, conflictFreeDays, config.restrictionDecayDays);
  if (!CONDUCT_RESTRICTION_DAYS.includes(levelDays)) throw new Error("Unsupported restriction duration.");
  const restrictedUntil = new Date(now.getTime() + levelDays * 86_400_000);

  return prisma.$transaction(async (transaction) => {
    const restriction = existing
      ? await transaction.conductRestriction.update({
          where: { id: existing.id },
          data: {
            levelDays,
            active: true,
            restrictedUntil,
            lastVerifiedConflictAt: now,
            lastRestrictionEndedAt: existing.active ? existing.lastRestrictionEndedAt : existing.restrictedUntil,
            decayAppliedAt: conflictFreeDays >= config.restrictionDecayDays ? now : existing.decayAppliedAt,
            reason: input.reason.trim().slice(0, 2000),
            createdByUserId: input.createdByUserId ?? null
          }
        })
      : await transaction.conductRestriction.create({
          data: {
            reference: createConductReference("RST"),
            ...pair,
            levelDays,
            restrictedUntil,
            lastVerifiedConflictAt: now,
            reason: input.reason.trim().slice(0, 2000),
            createdByUserId: input.createdByUserId ?? null
          }
        });
    await transaction.conductEvent.create({
      data: {
        restrictionId: restriction.id,
        actorUserId: input.createdByUserId ?? null,
        type: existing ? "RESTRICTION_UPDATED" : "RESTRICTION_CREATED",
        metadata: asJson({ levelDays, restrictedUntil: restrictedUntil.toISOString(), conflictFreeDays })
      }
    });
    await transaction.notification.createMany({
      data: [input.firstUserId, input.secondUserId].map((userId) => ({
        userId,
        title: "Temporary communication restriction",
        body: `Direct interaction between the two accounts is paused until ${restrictedUntil.toLocaleString("en-US")}.`,
        href: "/settings/reports"
      }))
    });
    return restriction;
  });
}

export async function getActivePairwiseConductRestriction(firstUserId: string, secondUserId: string) {
  if (!firstUserId || !secondUserId || firstUserId === secondUserId) return null;
  const pair = canonicalConductPair(firstUserId, secondUserId);
  const restriction = await prisma.conductRestriction.findUnique({ where: { userLowId_userHighId: pair } });
  if (!restriction?.active) return null;
  if (restriction.restrictedUntil > new Date()) return restriction;
  await prisma.$transaction(async (transaction) => {
    await transaction.conductRestriction.update({
      where: { id: restriction.id },
      data: { active: false, lastRestrictionEndedAt: restriction.restrictedUntil }
    });
    await transaction.conductEvent.create({
      data: { restrictionId: restriction.id, type: "RESTRICTION_EXPIRED" }
    });
  });
  return null;
}

export async function assertConductInteractionAllowed(actorUserId: string, targetUserId: string) {
  const restriction = await getActivePairwiseConductRestriction(actorUserId, targetUserId);
  if (restriction) throw new ConductInteractionRestrictedError(restriction.restrictedUntil);
}

export async function assertConductTargetsAllowed(actorUserId: string, targetUserIds: Iterable<string>) {
  for (const targetUserId of new Set(targetUserIds)) {
    if (targetUserId && targetUserId !== actorUserId) await assertConductInteractionAllowed(actorUserId, targetUserId);
  }
}

export async function resolveMentionedUserIds(body: string) {
  const usernames = Array.from(new Set(Array.from(body.matchAll(/(?:^|\s)@([a-z0-9_]{2,32})\b/gi), (match) => match[1].toLowerCase())));
  if (!usernames.length) return [];
  const users = await prisma.user.findMany({ where: { username: { in: usernames } }, select: { id: true } });
  return users.map((user) => user.id);
}
