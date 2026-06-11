import { getTierPolicy } from "@/lib/policy/tier-policy";

export function canCreateEvent(subscriptionTier: string | null | undefined) {
  return getTierPolicy(subscriptionTier).canCreateEvent;
}

