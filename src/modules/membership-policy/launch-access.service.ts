import { AuditSeverity, MembershipTier, Prisma, PromotionAccessScope, UserRole } from "@prisma/client";
import { z } from "zod";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";

const MODULE_KEY = "launch-access";

const subscriptionDefaults = [
  {
    tier: MembershipTier.FREE,
    displayName: "Free",
    standardPriceCents: 0,
    founderPriceCents: null,
    founderMemberCap: null,
    founderWindowDays: null,
    monthlyCreditBudget: 0,
    populationCreditTiers: []
  },
  {
    tier: MembershipTier.CONTRIBUTOR,
    displayName: "Contributor",
    standardPriceCents: 499,
    founderPriceCents: 199,
    founderMemberCap: 50,
    founderWindowDays: 180,
    monthlyCreditBudget: 10,
    populationCreditTiers: [
      { members: 0, credits: 10 },
      { members: 250, credits: 25 },
      { members: 1000, credits: 50 },
      { members: 5000, credits: 100 }
    ]
  },
  {
    tier: MembershipTier.PROFESSIONAL,
    displayName: "Professional",
    standardPriceCents: 1499,
    founderPriceCents: 499,
    founderMemberCap: 50,
    founderWindowDays: 180,
    monthlyCreditBudget: 25,
    populationCreditTiers: [
      { members: 0, credits: 25 },
      { members: 250, credits: 50 },
      { members: 1000, credits: 100 },
      { members: 5000, credits: 200 }
    ]
  },
  {
    tier: MembershipTier.AUDITOR,
    displayName: "Auditor",
    standardPriceCents: 999,
    founderPriceCents: null,
    founderMemberCap: null,
    founderWindowDays: null,
    monthlyCreditBudget: 10,
    populationCreditTiers: []
  }
] as const;

const adExperienceDefaults = [
  {
    key: "main-stream-ad-organic-ratio",
    label: "Main stream ad density",
    description: "Minimum organic posts between sponsored stream placements.",
    value: 20,
    unit: "organic_posts"
  },
  {
    key: "sponsored-mail-per-user-day",
    label: "Sponsored mail daily cap",
    description: "Maximum sponsored internal mail a member can receive per day.",
    value: 1,
    unit: "mail_per_day"
  },
  {
    key: "sponsored-mail-per-user-week",
    label: "Sponsored mail weekly cap",
    description: "Maximum sponsored internal mail a member can receive per week.",
    value: 3,
    unit: "mail_per_week"
  },
  {
    key: "same-business-sponsored-mail-cooldown",
    label: "Same sender sponsored mail cooldown",
    description: "Minimum days before the same business can send another sponsored mail to the same member.",
    value: 14,
    unit: "days"
  },
  {
    key: "market-listing-boost-cooldown",
    label: "Market boost cooldown",
    description: "Minimum hours between boosts on the same listing.",
    value: 24,
    unit: "hours"
  },
  {
    key: "service-posts-per-business-day",
    label: "Service stream daily cap",
    description: "Maximum paid service posts per business per day.",
    value: 1,
    unit: "posts_per_day"
  }
] as const;

export const launchAccessGrantSchema = z.object({
  scope: z.nativeEnum(PromotionAccessScope),
  userIdentifier: z.string().trim().max(160).optional(),
  sourceTier: z.nativeEnum(MembershipTier).default(MembershipTier.FREE),
  targetTier: z.enum([MembershipTier.CONTRIBUTOR, MembershipTier.PROFESSIONAL]),
  durationMonths: z.coerce.number().int().min(1).max(24).optional(),
  durationValue: z.coerce.number().int().min(1).max(730).optional(),
  durationUnit: z.enum(["days", "months"]).default("months"),
  label: z.string().trim().min(2).max(120),
  reason: z.string().trim().max(500).optional()
});

async function isAdminUser(userId?: string) {
  if (!userId) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  return user?.role === UserRole.ADMIN;
}

export async function ensureLaunchDefaults() {
  await Promise.all([
    ...subscriptionDefaults.map((plan) =>
      prisma.subscriptionPlanRule.upsert({
        where: { tier: plan.tier },
        update: {},
        create: {
          tier: plan.tier,
          displayName: plan.displayName,
          standardPriceCents: plan.standardPriceCents,
          founderPriceCents: plan.founderPriceCents,
          founderMemberCap: plan.founderMemberCap,
          founderWindowDays: plan.founderWindowDays,
          monthlyCreditBudget: plan.monthlyCreditBudget,
          populationCreditTiers: plan.populationCreditTiers as unknown as Prisma.InputJsonArray
        }
      })
    ),
    ...adExperienceDefaults.map((rule) =>
      prisma.adExperienceRule.upsert({
        where: { key: rule.key },
        update: {},
        create: rule
      })
    )
  ]);
}

export async function listLaunchAccessAdminView() {
  await ensureLaunchDefaults();

  const [plans, adRules, activeGrants] = await Promise.all([
    prisma.subscriptionPlanRule.findMany({ orderBy: { standardPriceCents: "asc" } }),
    prisma.adExperienceRule.findMany({ orderBy: { key: "asc" } }),
    prisma.membershipPromotionGrant.findMany({
      where: {
        active: true,
        expiresAt: { gt: new Date() }
      },
      orderBy: { expiresAt: "asc" },
      take: 50,
      include: {
        user: {
          select: {
            email: true,
            username: true,
            profile: { select: { displayName: true } }
          }
        }
      }
    })
  ]);

  return {
    plans: plans.map((plan) => ({
      tier: plan.tier,
      displayName: plan.displayName,
      standardPriceCents: plan.standardPriceCents,
      founderPriceCents: plan.founderPriceCents,
      founderMemberCap: plan.founderMemberCap,
      founderWindowDays: plan.founderWindowDays,
      monthlyCreditBudget: plan.monthlyCreditBudget,
      populationCreditTiers: plan.populationCreditTiers
    })),
    adRules: adRules.map((rule) => ({
      key: rule.key,
      label: rule.label,
      description: rule.description,
      value: rule.value,
      unit: rule.unit,
      active: rule.active
    })),
    activeGrants: activeGrants.map((grant) => ({
      id: grant.id,
      scope: grant.scope,
      userLabel: grant.user?.profile?.displayName ?? grant.user?.username ?? grant.user?.email ?? "All matching users",
      sourceTier: grant.sourceTier,
      targetTier: grant.targetTier,
      label: grant.label,
      reason: grant.reason,
      expiresAt: grant.expiresAt.toISOString()
    }))
  };
}

export async function listSubscriptionPlanRules() {
  await ensureLaunchDefaults();

  const plans = await prisma.subscriptionPlanRule.findMany({
    where: { active: true },
    orderBy: { standardPriceCents: "asc" }
  });

  return plans.map((plan) => ({
    tier: plan.tier,
    displayName: plan.displayName,
    standardPriceCents: plan.standardPriceCents,
    founderPriceCents: plan.founderPriceCents,
    founderMemberCap: plan.founderMemberCap,
    founderWindowDays: plan.founderWindowDays,
    monthlyCreditBudget: plan.monthlyCreditBudget,
    populationCreditTiers: plan.populationCreditTiers
  }));
}

export async function getActivePromotionalTierForUser(userId: string, currentTier: MembershipTier) {
  const now = new Date();
  const grants = await prisma.membershipPromotionGrant.findMany({
    where: {
      active: true,
      sourceTier: currentTier,
      startsAt: { lte: now },
      expiresAt: { gt: now },
      OR: [{ scope: PromotionAccessScope.GLOBAL, userId: null }, { scope: PromotionAccessScope.USER, userId }]
    },
    orderBy: [{ targetTier: "desc" }, { expiresAt: "desc" }]
  });

  const professionalGrant = grants.find((grant) => grant.targetTier === MembershipTier.PROFESSIONAL);
  const contributorGrant = grants.find((grant) => grant.targetTier === MembershipTier.CONTRIBUTOR);
  const grant = professionalGrant ?? contributorGrant ?? null;

  return grant
    ? {
        tier: grant.targetTier,
        label: grant.label,
        expiresAt: grant.expiresAt
      }
    : null;
}

export async function createLaunchAccessGrant(actorUserId: string, input: unknown) {
  if (!(await isAdminUser(actorUserId))) {
    return { ok: false as const, error: "Admin access required." };
  }

  const parsed = launchAccessGrantSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid launch access grant." };
  }

  const durationValue = parsed.data.durationValue ?? parsed.data.durationMonths;
  const durationUnit = parsed.data.durationValue ? parsed.data.durationUnit : "months";

  if (!durationValue) {
    return { ok: false as const, error: "Choose how long the promotional access should last." };
  }

  if (durationUnit === "months" && durationValue > 24) {
    return { ok: false as const, error: "Promotional access cannot exceed 24 months." };
  }

  let userId: string | null = null;

  if (parsed.data.scope === PromotionAccessScope.USER) {
    const identifier = parsed.data.userIdentifier?.trim().replace(/^@/, "").toLowerCase();

    if (!identifier) {
      return { ok: false as const, error: "Choose a user for individual promotional access." };
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { username: identifier }]
      },
      select: { id: true }
    });

    if (!user) {
      return { ok: false as const, error: "User was not found." };
    }

    userId = user.id;
  }

  const startsAt = new Date();
  const expiresAt = new Date(startsAt);

  if (durationUnit === "days") {
    expiresAt.setDate(expiresAt.getDate() + durationValue);
  } else {
    expiresAt.setMonth(expiresAt.getMonth() + durationValue);
  }

  const grant = await prisma.membershipPromotionGrant.create({
    data: {
      scope: parsed.data.scope,
      userId,
      sourceTier: parsed.data.sourceTier,
      targetTier: parsed.data.targetTier,
      label: parsed.data.label,
      reason: parsed.data.reason || null,
      startsAt,
      expiresAt,
      createdByUserId: actorUserId
    }
  });

  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "launch-access.grant.created",
    targetType: parsed.data.scope === PromotionAccessScope.USER ? "User" : "MembershipTier",
    targetId: userId ?? parsed.data.sourceTier,
    severity: AuditSeverity.warning,
    metadata: {
      scope: grant.scope,
      sourceTier: grant.sourceTier,
      targetTier: grant.targetTier,
      durationValue,
      durationUnit,
      expiresAt: grant.expiresAt.toISOString()
    } as Prisma.InputJsonObject
  });
  await diagnostics.info(MODULE_KEY, "Launch access promotional tier grant created.", {
    actorUserId,
    scope: grant.scope,
    userId,
    sourceTier: grant.sourceTier,
    targetTier: grant.targetTier,
    durationValue,
    durationUnit
  });

  return { ok: true as const, grant };
}
