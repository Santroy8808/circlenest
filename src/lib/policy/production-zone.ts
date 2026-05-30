export type ProductionZoneFeature = "BAZAAR" | "WRITERS_STUDIO" | "BUSINESS_PROFILE";
export type ProductionZoneAccess = { canBrowse: boolean; canCreate: boolean; reason?: string };

export function resolveProductionZoneAccess(subscriptionTier: string | null | undefined, isInvitedCreator = false): ProductionZoneAccess {
  const tier = (subscriptionTier ?? "FREE").toUpperCase();
  const canBrowse = true;
  const paidTier = tier !== "FREE";
  const canCreate = isInvitedCreator && paidTier;
  if (canCreate) return { canBrowse, canCreate };
  return {
    canBrowse,
    canCreate: false,
    reason: !isInvitedCreator ? "Creation is invite-only right now." : "A paid subscription is required to create here.",
  };
}

