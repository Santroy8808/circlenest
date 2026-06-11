import "server-only";

import { getTierPolicy, resolveUserAccessPolicy, type TierPolicy } from "@/lib/policy/tier-policy";
import { hasFreshAdminModeAccess } from "@/lib/security/action-access";

type UserPolicySource = {
  subscriptionTier?: string | null;
  role?: string | null;
} | null | undefined;

export function resolveMemberAccessPolicy(userId: string, user: UserPolicySource): TierPolicy {
  if (user?.role === "ADMIN" && !hasFreshAdminModeAccess(userId)) {
    return getTierPolicy(user?.subscriptionTier);
  }

  return resolveUserAccessPolicy(user);
}
