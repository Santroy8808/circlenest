import { AdPlacement, PlatformCostSubject, Prisma, UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { adPlacementLabels } from "@/modules/ads-credits/types";
import {
  adPlacementCostSubjects,
  platformCostSubjectLabels,
  updatePlatformCostRuleSchema,
  type AdPricingPackageView,
  type PlatformCostRuleView
} from "@/modules/platform-pricing/types";

const MODULE_KEY = "platform-pricing";

type DefaultCostRule = {
  key: string;
  subject: PlatformCostSubject;
  label: string;
  description: string;
  creditCost: number;
  durationDays?: number;
  includedUnits?: number;
  unitLabel: string;
  sortOrder: number;
};

export const defaultPlatformCostRules: DefaultCostRule[] = [
  {
    key: "market.product.listing.free.payg",
    subject: PlatformCostSubject.MARKET_PRODUCT_LISTING,
    label: "Product listing, pay as you go",
    description: "Free members can pay credits to post a product listing when no included allotment applies.",
    creditCost: 1,
    durationDays: 14,
    unitLabel: "listing",
    sortOrder: 10
  },
  {
    key: "market.product.extraListing",
    subject: PlatformCostSubject.MARKET_PRODUCT_EXTRA_LISTING,
    label: "Extra product listing",
    description: "Used after a member has exhausted their included Market product listing allotment.",
    creditCost: 1,
    durationDays: 14,
    unitLabel: "listing",
    sortOrder: 20
  },
  {
    key: "market.product.renew",
    subject: PlatformCostSubject.MARKET_PRODUCT_RENEW,
    label: "Renew product listing",
    description: "Renews a product listing for another listing cycle.",
    creditCost: 1,
    durationDays: 14,
    unitLabel: "renewal",
    sortOrder: 30
  },
  {
    key: "market.product.boost",
    subject: PlatformCostSubject.MARKET_PRODUCT_BOOST,
    label: "Boost product listing",
    description: "Moves a product listing back to the top of the relevant Market results.",
    creditCost: 1,
    unitLabel: "boost",
    sortOrder: 40
  },
  {
    key: "market.service.post.7d",
    subject: PlatformCostSubject.MARKET_SERVICE_POST,
    label: "Service post, 7 days",
    description: "Posts a business/service promotion into the Market service stream.",
    creditCost: 5,
    durationDays: 7,
    unitLabel: "post",
    sortOrder: 50
  },
  {
    key: "market.service.boost",
    subject: PlatformCostSubject.MARKET_SERVICE_BOOST,
    label: "Boost service post",
    description: "Moves a Market service post back to the top.",
    creditCost: 3,
    unitLabel: "boost",
    sortOrder: 60
  },
  {
    key: "market.monthlySpecial.30d",
    subject: PlatformCostSubject.MONTHLY_SPECIAL,
    label: "Monthly special",
    description: "Shows a business special in the monthly specials area.",
    creditCost: 15,
    durationDays: 30,
    unitLabel: "special",
    sortOrder: 70
  },
  {
    key: "stream.promotedPost.1d",
    subject: PlatformCostSubject.MAIN_STREAM_PROMOTED_POST,
    label: "Main stream promoted post, 1 day",
    description: "Expensive protected placement in the primary member stream.",
    creditCost: 50,
    durationDays: 1,
    unitLabel: "slot",
    sortOrder: 80
  },
  {
    key: "mail.sponsoredInternal.base",
    subject: PlatformCostSubject.MAIL_SPONSORED_INTERNAL,
    label: "Sponsored internal mail",
    description: "Internal sponsored mail package. Delivery is internal only and never external email.",
    creditCost: 10,
    includedUnits: 25,
    unitLabel: "send",
    sortOrder: 90
  },
  {
    key: "ads.rightBillboard.small.7d",
    subject: PlatformCostSubject.AD_RIGHT_BILLBOARD_SMALL,
    label: "Right billboard, small, 7 days",
    description: "Small side billboard package in the reserved ad rail.",
    creditCost: 8,
    durationDays: 7,
    unitLabel: "slot",
    sortOrder: 100
  },
  {
    key: "ads.rightBillboard.medium.7d",
    subject: PlatformCostSubject.AD_RIGHT_BILLBOARD_MEDIUM,
    label: "Right billboard, medium, 7 days",
    description: "Medium side billboard package with a longer hold weight in rotation.",
    creditCost: 14,
    durationDays: 7,
    unitLabel: "slot",
    sortOrder: 110
  },
  {
    key: "ads.rightBillboard.large.30d",
    subject: PlatformCostSubject.AD_RIGHT_BILLBOARD_LARGE,
    label: "Right billboard, large, 30 days",
    description: "Monthly side billboard package with the strongest hold weight in the right rail.",
    creditCost: 45,
    durationDays: 30,
    unitLabel: "slot",
    sortOrder: 120
  },
  {
    key: "ads.businessSpotlight.30d",
    subject: PlatformCostSubject.AD_BUSINESS_SPOTLIGHT,
    label: "Business spotlight, 30 days",
    description: "Business spotlight package outside the primary social stream.",
    creditCost: 25,
    durationDays: 30,
    unitLabel: "slot",
    sortOrder: 130
  },
  {
    key: "ads.reservedStream.1d",
    subject: PlatformCostSubject.AD_RESERVED_STREAM,
    label: "Reserved stream slot, 1 day",
    description: "Adaptive promoted stream placement for web and mobile feed use. Viewer exposure varies by use and is capped at 5% of stream experience.",
    creditCost: 60,
    durationDays: 1,
    unitLabel: "slot",
    sortOrder: 140
  },
  {
    key: "event.boost.7d",
    subject: PlatformCostSubject.EVENT_BOOST,
    label: "Event boost, 7 days",
    description: "Boosts an event without embedding ads inside the event detail.",
    creditCost: 12,
    durationDays: 7,
    unitLabel: "boost",
    sortOrder: 150
  },
  {
    key: "storefront.spotlight.30d",
    subject: PlatformCostSubject.STOREFRONT_SPOTLIGHT,
    label: "Storefront spotlight, 30 days",
    description: "Promotes a Professional storefront in business discovery surfaces.",
    creditCost: 25,
    durationDays: 30,
    unitLabel: "spotlight",
    sortOrder: 160
  }
];

function toCostRuleView(rule: {
  id: string;
  key: string;
  subject: PlatformCostSubject;
  label: string;
  description: string | null;
  creditCost: number;
  durationDays: number | null;
  includedUnits: number | null;
  unitLabel: string;
  active: boolean;
  sortOrder: number;
  updatedAt: Date;
}): PlatformCostRuleView {
  return {
    id: rule.id,
    key: rule.key,
    subject: rule.subject,
    subjectLabel: platformCostSubjectLabels[rule.subject],
    label: rule.label,
    description: rule.description,
    creditCost: rule.creditCost,
    durationDays: rule.durationDays,
    includedUnits: rule.includedUnits,
    unitLabel: rule.unitLabel,
    active: rule.active,
    sortOrder: rule.sortOrder,
    updatedAt: rule.updatedAt.toISOString()
  };
}

function toAdPricingPackage(rule: PlatformCostRuleView): AdPricingPackageView | null {
  const placement = (Object.entries(adPlacementCostSubjects) as Array<[AdPlacement, PlatformCostSubject[]]>).find(([, subjects]) =>
    subjects.includes(rule.subject)
  )?.[0];

  if (!placement) return null;

  return {
    ...rule,
    placement,
    placementLabel: adPlacementLabels[placement]
  };
}

async function isAdminUser(userId?: string) {
  if (!userId) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  return user?.role === UserRole.ADMIN;
}

export async function ensureDefaultPlatformCostRules() {
  await Promise.all(
    defaultPlatformCostRules.map((rule) =>
      prisma.platformCostRule.upsert({
        where: { key: rule.key },
        update: {},
        create: {
          key: rule.key,
          subject: rule.subject,
          label: rule.label,
          description: rule.description,
          creditCost: rule.creditCost,
          durationDays: rule.durationDays ?? null,
          includedUnits: rule.includedUnits ?? null,
          unitLabel: rule.unitLabel,
          sortOrder: rule.sortOrder
        }
      })
    )
  );
}

export async function listPlatformCostRules() {
  await ensureDefaultPlatformCostRules();

  const rules = await prisma.platformCostRule.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }]
  });

  return rules.map(toCostRuleView);
}

export async function getAdPricingPackages() {
  const rules = await listPlatformCostRules();

  return rules
    .filter((rule) => rule.active)
    .map(toAdPricingPackage)
    .filter((rule): rule is AdPricingPackageView => Boolean(rule));
}

export async function getActivePlatformCostRuleByKey(key: string) {
  await ensureDefaultPlatformCostRules();

  const rule = await prisma.platformCostRule.findFirst({
    where: {
      key,
      active: true
    }
  });

  return rule ? toCostRuleView(rule) : null;
}

export function isAdPricingRuleCompatible(placement: AdPlacement, subject: PlatformCostSubject) {
  return adPlacementCostSubjects[placement].includes(subject);
}

export async function updatePlatformCostRule(actorUserId: string, input: unknown) {
  if (!(await isAdminUser(actorUserId))) {
    return { ok: false as const, error: "Admin access required." };
  }

  const parsed = updatePlatformCostRuleSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid pricing rule." };
  }

  const existing = await prisma.platformCostRule.findUnique({
    where: { key: parsed.data.key },
    select: { id: true, subject: true }
  });

  if (!existing) {
    return { ok: false as const, error: "Pricing rules must be created by code defaults first. Admins may update costs, durations, and active state." };
  }

  const rule = await prisma.platformCostRule.update({
    where: { key: parsed.data.key },
    data: {
      label: parsed.data.label,
      description: parsed.data.description || null,
      creditCost: parsed.data.creditCost,
      durationDays: parsed.data.durationDays || null,
      includedUnits: parsed.data.includedUnits || null,
      unitLabel: parsed.data.unitLabel,
      active: parsed.data.active,
      sortOrder: parsed.data.sortOrder,
      updatedByUserId: actorUserId
    }
  });

  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "pricing-rule.updated",
    targetType: "PlatformCostRule",
    targetId: rule.id,
    severity: "warning",
    metadata: {
      key: rule.key,
      subject: rule.subject,
      creditCost: rule.creditCost,
      durationDays: rule.durationDays,
      active: rule.active
    } as Prisma.InputJsonObject
  });
  await diagnostics.info(MODULE_KEY, "Platform cost rule updated.", {
    actorUserId,
    key: rule.key,
    subject: rule.subject,
    creditCost: rule.creditCost
  });

  return { ok: true as const, rule: toCostRuleView(rule) };
}
