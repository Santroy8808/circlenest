import {
  MembershipTier,
  MembershipUpgradeOfferStatus,
  MembershipUpgradeMode,
  Prisma,
  PromotionAccessScope
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/platform/db";
import { readPlatformEnv } from "@/lib/platform/env";
import { isAdminRole } from "@/lib/platform/roles";
import { listFreeAccountInviteAdminView } from "@/modules/membership-policy/free-account-invites.service";
import { grantContributorBetaOffer } from "@/modules/membership-policy/contributor-upgrade.service";
import { isOperationalMembershipTier } from "@/modules/membership-policy/policy";

const subscriptionDefaults = [
  {
    tier: MembershipTier.FREE,
    displayName: "Free",
    standardPriceCents: 0,
    founderPriceCents: null,
    founderMemberCap: null,
    founderWindowDays: null,
    monthlyCreditBudget: 0,
    memberVisible: true,
    selfServiceEnabled: false,
    upgradeMode: MembershipUpgradeMode.NONE,
    futurePriceCents: null,
    populationCreditTiers: []
  },
  {
    tier: MembershipTier.CONTRIBUTOR,
    displayName: "Contributor",
    standardPriceCents: 499,
    founderPriceCents: null,
    founderMemberCap: null,
    founderWindowDays: null,
    monthlyCreditBudget: 10,
    memberVisible: true,
    selfServiceEnabled: true,
    upgradeMode: MembershipUpgradeMode.BETA_FREE,
    futurePriceCents: 499,
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
    memberVisible: false,
    selfServiceEnabled: false,
    upgradeMode: MembershipUpgradeMode.NONE,
    futurePriceCents: null,
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
    memberVisible: false,
    selfServiceEnabled: false,
    upgradeMode: MembershipUpgradeMode.NONE,
    futurePriceCents: null,
    populationCreditTiers: []
  },
  {
    tier: MembershipTier.ORG,
    displayName: "Org",
    standardPriceCents: 999,
    founderPriceCents: null,
    founderMemberCap: null,
    founderWindowDays: null,
    monthlyCreditBudget: 10,
    memberVisible: false,
    selfServiceEnabled: false,
    upgradeMode: MembershipUpgradeMode.NONE,
    futurePriceCents: null,
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

export function stripePriceIdForTier(tier: MembershipTier) {
  const env = readPlatformEnv();

  if (tier === MembershipTier.CONTRIBUTOR) return env.STRIPE_PRICE_CONTRIBUTOR ?? null;
  if (tier === MembershipTier.PROFESSIONAL) return env.STRIPE_PRICE_PROFESSIONAL ?? null;
  if (tier === MembershipTier.AUDITOR) return env.STRIPE_PRICE_AUDITOR ?? null;
  if (tier === MembershipTier.ORG) return env.STRIPE_PRICE_ORG ?? null;
  return null;
}

export const launchAccessGrantSchema = z.object({
  commandId: z.string().trim().min(8).max(160),
  scope: z.nativeEnum(PromotionAccessScope),
  userIdentifier: z.string().trim().max(160).optional(),
  sourceTier: z.literal(MembershipTier.FREE).default(MembershipTier.FREE),
  targetTier: z.literal(MembershipTier.CONTRIBUTOR),
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
    select: { role: true, deactivatedAt: true }
  });

  return Boolean(user && !user.deactivatedAt && isAdminRole(user.role));
}

export async function ensureLaunchDefaults() {
  await Promise.all([
    ...subscriptionDefaults.map((plan) => {
      const stripePriceId = stripePriceIdForTier(plan.tier);

      return prisma.subscriptionPlanRule.upsert({
        where: { tier: plan.tier },
        update: {
          displayName: plan.displayName,
          standardPriceCents: plan.standardPriceCents,
          founderPriceCents: plan.founderPriceCents,
          founderMemberCap: plan.founderMemberCap,
          founderWindowDays: plan.founderWindowDays,
          monthlyCreditBudget: plan.monthlyCreditBudget,
          active: isOperationalMembershipTier(plan.tier),
          memberVisible: plan.memberVisible,
          selfServiceEnabled: plan.selfServiceEnabled,
          upgradeMode: plan.upgradeMode,
          futurePriceCents: plan.futurePriceCents,
          populationCreditTiers: plan.populationCreditTiers as unknown as Prisma.InputJsonArray,
          ...(stripePriceId ? { stripePriceId } : {})
        },
        create: {
          tier: plan.tier,
          displayName: plan.displayName,
          standardPriceCents: plan.standardPriceCents,
          stripePriceId,
          founderPriceCents: plan.founderPriceCents,
          founderMemberCap: plan.founderMemberCap,
          founderWindowDays: plan.founderWindowDays,
          monthlyCreditBudget: plan.monthlyCreditBudget,
          active: isOperationalMembershipTier(plan.tier),
          memberVisible: plan.memberVisible,
          selfServiceEnabled: plan.selfServiceEnabled,
          upgradeMode: plan.upgradeMode,
          futurePriceCents: plan.futurePriceCents,
          populationCreditTiers: plan.populationCreditTiers as unknown as Prisma.InputJsonArray
        }
      });
    }),
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

  const [plans, adRules, activeGrants, freeInvites] = await Promise.all([
    prisma.subscriptionPlanRule.findMany({
      where: { tier: { in: [MembershipTier.FREE, MembershipTier.CONTRIBUTOR] } },
      orderBy: { standardPriceCents: "asc" }
    }),
    prisma.adExperienceRule.findMany({ orderBy: { key: "asc" } }),
    prisma.membershipUpgradeOffer.findMany({
      where: {
        targetTier: MembershipTier.CONTRIBUTOR,
        status: MembershipUpgradeOfferStatus.OFFERED,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        eligibility: { select: { reason: true } },
        user: {
          select: {
            email: true,
            username: true,
            profile: { select: { displayName: true } }
          }
        }
      }
    }),
    listFreeAccountInviteAdminView()
  ]);

  return {
    plans: plans.map((plan) => ({
      tier: plan.tier,
      displayName: plan.displayName,
      standardPriceCents: plan.standardPriceCents,
      stripePriceId: plan.stripePriceId,
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
      scope: PromotionAccessScope.USER,
      userLabel: grant.user?.profile?.displayName ?? grant.user?.username ?? grant.user?.email ?? "All matching users",
      sourceTier: MembershipTier.FREE,
      targetTier: grant.targetTier,
      label: "Contributor beta offer",
      reason: grant.eligibility.reason,
      expiresAt: grant.expiresAt?.toISOString() ?? null
    })),
    freeInvites
  };
}

export async function listSubscriptionPlanRules() {
  await ensureLaunchDefaults();

  const plans = await prisma.subscriptionPlanRule.findMany({
    where: {
      active: true,
      tier: { in: [MembershipTier.FREE, MembershipTier.CONTRIBUTOR] }
    },
    orderBy: { standardPriceCents: "asc" }
  });

  return plans.map((plan) => ({
    tier: plan.tier,
    displayName: plan.displayName,
    standardPriceCents: plan.standardPriceCents,
    stripePriceId: plan.stripePriceId,
    founderPriceCents: plan.founderPriceCents,
    founderMemberCap: plan.founderMemberCap,
    founderWindowDays: plan.founderWindowDays,
    monthlyCreditBudget: plan.monthlyCreditBudget,
    populationCreditTiers: plan.populationCreditTiers
  }));
}

export async function createLaunchAccessGrant(actorUserId: string, input: unknown) {
  if (!(await isAdminUser(actorUserId))) {
    return { ok: false as const, error: "Admin access required." };
  }

  const parsed = launchAccessGrantSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid launch access grant." };
  }

  if (parsed.data.scope !== PromotionAccessScope.USER) {
    return { ok: false as const, error: "Contributor beta access must be granted to one specific Free member." };
  }

  const durationValue = parsed.data.durationValue ?? parsed.data.durationMonths;
  const durationUnit = parsed.data.durationValue ? parsed.data.durationUnit : "months";

  if (!durationValue) {
    return { ok: false as const, error: "Choose how long the promotional access should last." };
  }

  if (durationUnit === "months" && durationValue > 24) {
    return { ok: false as const, error: "Promotional access cannot exceed 24 months." };
  }

  const identifier = parsed.data.userIdentifier?.trim().replace(/^@/, "").toLowerCase();

  if (!identifier) {
    return { ok: false as const, error: "Choose a user for individual Contributor beta access." };
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

  const startsAt = new Date();
  const expiresAt = new Date(startsAt);

  if (durationUnit === "days") {
    expiresAt.setDate(expiresAt.getDate() + durationValue);
  } else {
    expiresAt.setMonth(expiresAt.getMonth() + durationValue);
  }

  const result = await grantContributorBetaOffer(actorUserId, {
    commandId: parsed.data.commandId,
    targetUserId: user.id,
    expiresAt,
    reason: parsed.data.reason || parsed.data.label
  });

  if (!result.ok) return result;

  return { ok: true as const, grant: result.offer };
}
