const BAZAAR_CREATOR_TIERS = new Set(["BUSINESS", "SILVER", "GOLD", "DIAMOND"]);

export function canCreateBazaarListing(subscriptionTier: string | null | undefined) {
  const tier = (subscriptionTier ?? "FREE").toUpperCase();
  return BAZAAR_CREATOR_TIERS.has(tier);
}

