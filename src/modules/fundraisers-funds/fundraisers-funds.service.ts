import { FundContributionStatus, FundraiserCategory, FundraiserStatus, MembershipTier, Prisma, UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { canUserAccessFeature, getEffectivePolicyForUser } from "@/modules/membership-policy/membership-policy.service";
import {
  createContributionIntentSchema,
  createFundraiserSchema,
  fundraiserCategoryLabels,
  type FundraiserCardView,
  type FundraiserCreateState,
  type FundraiserDetailView
} from "@/modules/fundraisers-funds/types";

const MODULE_KEY = "fundraisers-funds";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function uniqueFundraiserSlug(title: string) {
  const base = slugify(title) || "fundraiser";
  let candidate = base;
  let index = 2;

  while (await prisma.fundraiserCampaign.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${index}`;
    index += 1;
  }

  return candidate;
}

function monthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function profileName(user: { username: string; profile: { displayName: string | null } | null }) {
  return user.profile?.displayName ?? user.username;
}

async function getViewerRole(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  return user?.role ?? UserRole.MEMBER;
}

type FundraiserPayload = Prisma.FundraiserCampaignGetPayload<{
  include: {
    creator: { include: { profile: true } };
    contributions: true;
  };
}>;

function confirmedOrPledgedTotal(contributions: Array<{ amountCents: number; status: FundContributionStatus }>) {
  return contributions
    .filter((contribution) => contribution.status === FundContributionStatus.PLEDGED || contribution.status === FundContributionStatus.PROCESSOR_CONFIRMED)
    .reduce((sum, contribution) => sum + contribution.amountCents, 0);
}

function toFundraiserCard(campaign: FundraiserPayload): FundraiserCardView {
  return {
    id: campaign.id,
    slug: campaign.slug,
    title: campaign.title,
    summary: campaign.summary,
    category: campaign.category,
    categoryLabel: fundraiserCategoryLabels[campaign.category],
    goalAmountCents: campaign.goalAmountCents,
    pledgedAmountCents: confirmedOrPledgedTotal(campaign.contributions),
    currency: campaign.currency,
    status: campaign.status,
    createdAt: campaign.createdAt.toISOString(),
    creator: {
      username: campaign.creator.username,
      displayName: profileName(campaign.creator),
      avatarUrl: campaign.creator.profile?.avatarUrl ?? null
    }
  };
}

export async function getFundraiserCreateState(userId: string): Promise<FundraiserCreateState> {
  const [role, policy, access] = await Promise.all([
    getViewerRole(userId),
    getEffectivePolicyForUser(userId),
    canUserAccessFeature(userId, "fundraisers.create")
  ]);

  if (role === UserRole.ADMIN) {
    return {
      viewerCanCreate: true,
      fundraiserLimit: null,
      fundraisersRemaining: null
    };
  }

  if (!access.allowed || !policy) {
    return {
      viewerCanCreate: false,
      reason: access.reason,
      fundraiserLimit: 0,
      fundraisersRemaining: 0
    };
  }

  const limit = policy.limits.fundraiserPerMonth;

  if (limit === null) {
    return {
      viewerCanCreate: true,
      fundraiserLimit: null,
      fundraisersRemaining: null
    };
  }

  const used = await prisma.fundraiserCampaign.count({
    where: {
      creatorUserId: userId,
      createdAt: { gte: monthStart() },
      status: { not: FundraiserStatus.ARCHIVED }
    }
  });
  const remaining = Math.max(0, limit - used);

  return {
    viewerCanCreate: remaining > 0,
    reason: remaining > 0 ? undefined : `You have used your ${limit} fundraiser for this month.`,
    fundraiserLimit: limit,
    fundraisersRemaining: remaining
  };
}

export async function listFundraisers(input?: { category?: string | null }) {
  const category = input?.category && input.category in FundraiserCategory ? (input.category as FundraiserCategory) : null;
  const campaigns = await prisma.fundraiserCampaign.findMany({
    where: {
      status: FundraiserStatus.ACTIVE,
      ...(category ? { category } : {})
    },
    include: {
      creator: {
        include: {
          profile: true
        }
      },
      contributions: true
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 80
  });

  return campaigns.map(toFundraiserCard);
}

export async function safeListFundraisers(input?: { category?: string | null }) {
  try {
    return await listFundraisers(input);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not list fundraisers.", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return [];
  }
}

export async function createFundraiser(userId: string, input: unknown) {
  const parsed = createFundraiserSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid fundraiser." };
  }

  const state = await getFundraiserCreateState(userId);

  if (!state.viewerCanCreate) {
    return { ok: false as const, error: state.reason ?? "This account cannot create fundraisers." };
  }

  const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null;
  const campaign = await prisma.fundraiserCampaign.create({
    data: {
      slug: await uniqueFundraiserSlug(parsed.data.title),
      creatorUserId: userId,
      title: parsed.data.title,
      summary: parsed.data.summary || null,
      description: parsed.data.description,
      category: parsed.data.category,
      goalAmountCents: parsed.data.goalAmountCents ?? null,
      endsAt: endsAt && Number.isFinite(endsAt.getTime()) ? endsAt : null
    }
  });

  await diagnostics.info(MODULE_KEY, "Fundraiser campaign created.", {
    userId,
    fundraiserCampaignId: campaign.id
  });
  await writeAuditLog({
    actorUserId: userId,
    module: MODULE_KEY,
    action: "fundraiser.created",
    targetType: "FundraiserCampaign",
    targetId: campaign.id
  });

  return { ok: true as const, campaign };
}

export async function getFundraiserDetail(viewerUserId: string, campaignIdOrSlug: string) {
  const campaign = await prisma.fundraiserCampaign.findFirst({
    where: {
      OR: [{ id: campaignIdOrSlug }, { slug: campaignIdOrSlug }],
      status: { not: FundraiserStatus.ARCHIVED }
    },
    include: {
      creator: {
        include: {
          profile: true
        }
      },
      contributions: true
    }
  });

  if (!campaign) {
    return { ok: false as const, error: "Fundraiser not found." };
  }

  const role = await getViewerRole(viewerUserId);
  const detail: FundraiserDetailView = {
    ...toFundraiserCard(campaign),
    description: campaign.description,
    endsAt: campaign.endsAt?.toISOString() ?? null,
    viewerCanManage: role === UserRole.ADMIN || campaign.creatorUserId === viewerUserId,
    contributionCount: campaign.contributions.length
  };

  return { ok: true as const, campaign: detail };
}

export async function safeGetFundraiserDetail(viewerUserId: string, campaignIdOrSlug: string) {
  try {
    return await getFundraiserDetail(viewerUserId, campaignIdOrSlug);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not load fundraiser detail.", {
      viewerUserId,
      campaignIdOrSlug,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { ok: false as const, error: "Could not load fundraiser." };
  }
}

export async function createContributionIntent(userId: string, campaignIdOrSlug: string, input: unknown) {
  const parsed = createContributionIntentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid contribution intent." };
  }

  const campaign = await prisma.fundraiserCampaign.findFirst({
    where: {
      OR: [{ id: campaignIdOrSlug }, { slug: campaignIdOrSlug }],
      status: FundraiserStatus.ACTIVE
    },
    select: {
      id: true
    }
  });

  if (!campaign) {
    return { ok: false as const, error: "Active fundraiser not found." };
  }

  const intent = await prisma.fundContributionIntent.create({
    data: {
      campaignId: campaign.id,
      contributorUserId: userId,
      amountCents: parsed.data.amountCents,
      note: parsed.data.note || null
    }
  });

  await diagnostics.info(MODULE_KEY, "Fund contribution intent created.", {
    userId,
    fundraiserCampaignId: campaign.id,
    contributionIntentId: intent.id
  });

  return { ok: true as const, intent };
}

export function viewerCanInteractWithFunds(tier?: MembershipTier | null) {
  return tier === MembershipTier.CONTRIBUTOR || tier === MembershipTier.PROFESSIONAL;
}
