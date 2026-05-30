const EVENT_CREATOR_TIERS = new Set(["BUSINESS", "SILVER", "GOLD", "DIAMOND"]);

export function canCreateEvent(subscriptionTier: string | null | undefined) {
  const tier = (subscriptionTier ?? "FREE").toUpperCase();
  return EVENT_CREATOR_TIERS.has(tier);
}

