import { AdDeliveryEventType, AdPlacement, Prisma, UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";
import {
  adPlacementLabels,
  createAdCampaignSchema,
  type AdCampaignCardView,
  type AdsManagerView
} from "@/modules/ads-credits/types";

const MODULE_KEY = "ads-credits";

async function getAdCreateAccess(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  if (!user) return { allowed: false, reason: "User was not found.", isAdmin: false };
  if (user.role === UserRole.ADMIN) return { allowed: true, reason: "Admin role can create platform ads.", isAdmin: true };

  const access = await canUserAccessFeature(userId, "ads.createGeneral");
  return { ...access, isAdmin: false };
}

type AdCampaignPayload = Prisma.AdCampaignGetPayload<Record<string, never>>;

function toCampaignCard(campaign: AdCampaignPayload): AdCampaignCardView {
  return {
    id: campaign.id,
    title: campaign.title,
    body: campaign.body,
    destinationUrl: campaign.destinationUrl,
    placement: campaign.placement,
    placementLabel: adPlacementLabels[campaign.placement],
    status: campaign.status,
    targetLocation: campaign.targetLocation,
    targetClassification: campaign.targetClassification,
    totalBudgetCredits: campaign.totalBudgetCredits,
    dailyBudgetCredits: campaign.dailyBudgetCredits,
    spentCredits: campaign.spentCredits,
    createdAt: campaign.createdAt.toISOString()
  };
}

export async function getAdsManagerView(userId: string): Promise<AdsManagerView> {
  const [access, membership, campaigns] = await Promise.all([
    getAdCreateAccess(userId),
    prisma.membership.findUnique({
      where: { userId },
      select: { platformCredits: true }
    }),
    prisma.adCampaign.findMany({
      where: { ownerUserId: userId },
      orderBy: { createdAt: "desc" },
      take: 40
    })
  ]);

  return {
    canCreate: access.allowed,
    reason: access.reason,
    platformCredits: membership?.platformCredits ?? 0,
    campaigns: campaigns.map(toCampaignCard)
  };
}

export async function createAdCampaign(userId: string, input: unknown) {
  const parsed = createAdCampaignSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid ad campaign." };
  }

  const access = await getAdCreateAccess(userId);

  if (!access.allowed) {
    return { ok: false as const, error: access.reason ?? "Professional or Auditor access required." };
  }

  const membership = await prisma.membership.findUnique({
    where: { userId },
    select: { platformCredits: true }
  });

  if (!access.isAdmin && (membership?.platformCredits ?? 0) < parsed.data.totalBudgetCredits) {
    return { ok: false as const, error: "Not enough platform credits for this ad budget." };
  }

  const campaign = await prisma.$transaction(async (tx) => {
    if (!access.isAdmin) {
      await tx.membership.update({
        where: { userId },
        data: {
          platformCredits: {
            decrement: parsed.data.totalBudgetCredits
          }
        }
      });
      await tx.adCreditLedgerEntry.create({
        data: {
          userId,
          amount: -parsed.data.totalBudgetCredits,
          reason: "Reserved ad campaign budget"
        }
      });
    }

    return tx.adCampaign.create({
      data: {
        ownerUserId: userId,
        title: parsed.data.title,
        body: parsed.data.body,
        destinationUrl: parsed.data.destinationUrl || null,
        placement: parsed.data.placement,
        targetLocation: parsed.data.targetLocation || null,
        targetClassification: parsed.data.targetClassification ?? null,
        totalBudgetCredits: parsed.data.totalBudgetCredits,
        dailyBudgetCredits: parsed.data.dailyBudgetCredits || null
      }
    });
  });

  await diagnostics.info(MODULE_KEY, "Ad campaign created.", {
    userId,
    adCampaignId: campaign.id,
    placement: campaign.placement,
    totalBudgetCredits: campaign.totalBudgetCredits
  });
  await writeAuditLog({
    actorUserId: userId,
    module: MODULE_KEY,
    action: "ad.campaign.created",
    targetType: "AdCampaign",
    targetId: campaign.id,
    metadata: {
      placement: campaign.placement,
      totalBudgetCredits: campaign.totalBudgetCredits
    }
  });

  return { ok: true as const, campaign: toCampaignCard(campaign) };
}

export async function logAdDelivery(input: {
  campaignId: string;
  viewerUserId?: string;
  placement: AdPlacement;
  eventType: AdDeliveryEventType;
  metadata?: Record<string, unknown>;
}) {
  await prisma.adDeliveryLog.create({
    data: {
      campaignId: input.campaignId,
      viewerUserId: input.viewerUserId,
      placement: input.placement,
      eventType: input.eventType,
      metadata: input.metadata as Prisma.InputJsonObject | undefined
    }
  });

  await diagnostics.debug(MODULE_KEY, "Ad delivery event logged.", {
    campaignId: input.campaignId,
    viewerUserId: input.viewerUserId,
    placement: input.placement,
    eventType: input.eventType
  });
}
