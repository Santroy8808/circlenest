import {
  getBazaarListingLifetimeDays,
  getBazaarListingMaxImageCount,
  getBazaarListingRollingLimit,
  type TierPolicy,
} from "@/lib/policy/tier-policy";

export type MarketListingQuotaSnapshot = Readonly<{
  createdInRollingWindow: number;
}>;

export function getMarketListingQuota(policy: TierPolicy) {
  return {
    rollingLimit: getBazaarListingRollingLimit(policy),
    maxImages: getBazaarListingMaxImageCount(policy),
    lifetimeDays: getBazaarListingLifetimeDays(policy),
  };
}

export function evaluateMarketListingQuota(policy: TierPolicy, snapshot: MarketListingQuotaSnapshot) {
  const rollingLimit = getBazaarListingRollingLimit(policy);
  if (rollingLimit !== null && snapshot.createdInRollingWindow >= rollingLimit) {
    return {
      allowed: false,
      error: `Contributor members can post ${rollingLimit} marketplace listings every 2 weeks.`,
    } as const;
  }

  return { allowed: true, error: null } as const;
}
