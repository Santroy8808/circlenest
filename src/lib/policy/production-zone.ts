export type ProductionZoneFeature = "BAZAAR" | "WRITERS_STUDIO" | "BUSINESS_PROFILE";
export type ProductionZoneAccess = { canBrowse: boolean; canCreate: boolean; reason?: string };

function normalizedTier(subscriptionTier: string | null | undefined) {
  return (subscriptionTier ?? "FREE").toUpperCase();
}

export function resolveProductionZoneAccess(subscriptionTier: string | null | undefined, isInvitedCreator = false): ProductionZoneAccess {
  const tier = normalizedTier(subscriptionTier);
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

export function resolveBusinessProfileAccess(subscriptionTier: string | null | undefined, isInvitedCreator = false): ProductionZoneAccess {
  const tier = normalizedTier(subscriptionTier);
  const canCreate = tier === "PRO" || (isInvitedCreator && tier !== "FREE");
  if (canCreate) return { canBrowse: true, canCreate };
  return {
    canBrowse: true,
    canCreate: false,
    reason: tier === "FREE" || tier === "PLUS"
      ? "Biz is required to create a business profile and storefront."
      : "Business profile creation is locked for this account.",
  };
}

export function canCreateBusinessProfile(subscriptionTier: string | null | undefined, isInvitedCreator = false) {
  return resolveBusinessProfileAccess(subscriptionTier, isInvitedCreator).canCreate;
}

export function canCreateWritersStudio(subscriptionTier: string | null | undefined, isInvitedCreator = false) {
  return resolveProductionZoneAccess(subscriptionTier, isInvitedCreator).canCreate;
}

