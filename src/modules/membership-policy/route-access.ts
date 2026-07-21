import type { MembershipFeatureKey } from "@/modules/membership-policy/policy";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";

export const membershipRouteCapabilityMap = {
  writersCreate: "writers.access",
  writersStorefrontPublish: "market.storefront",
  supportCreate: "support.createRequest",
  businessManage: "market.storefront",
  businessAdsManage: "ads.createGeneral",
  auditorProfileCreate: "auditors.createProfile"
} as const satisfies Record<string, MembershipFeatureKey>;

export type MembershipRouteGate = keyof typeof membershipRouteCapabilityMap;
export type MembershipRouteSurface = "page" | "api";

export type MembershipRouteAccessDecision =
  | { allowed: true; capability: MembershipFeatureKey }
  | {
      allowed: false;
      capability: MembershipFeatureKey;
      error: "Not found." | "This action is not available for this membership.";
      status: 403 | 404;
    };

export function membershipRouteAccessDecision(
  gate: MembershipRouteGate,
  surface: MembershipRouteSurface,
  allowed: boolean
): MembershipRouteAccessDecision {
  const capability = membershipRouteCapabilityMap[gate];
  if (allowed) return { allowed: true, capability };

  return surface === "page"
    ? { allowed: false, capability, error: "Not found.", status: 404 }
    : {
        allowed: false,
        capability,
        error: "This action is not available for this membership.",
        status: 403
      };
}

export async function resolveMembershipRouteAccess(
  userId: string,
  gate: MembershipRouteGate,
  surface: MembershipRouteSurface
): Promise<MembershipRouteAccessDecision> {
  const capability = membershipRouteCapabilityMap[gate];
  const access = await canUserAccessFeature(userId, capability);
  return membershipRouteAccessDecision(gate, surface, access.allowed);
}
