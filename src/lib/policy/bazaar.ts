import { getTierPolicy } from "@/lib/policy/tier-policy";

export function canCreateBazaarListing(subscriptionTier: string | null | undefined) {
  return getTierPolicy(subscriptionTier).canCreateBazaarListing;
}

