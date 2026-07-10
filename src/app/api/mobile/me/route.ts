import { NextRequest, NextResponse } from "next/server";
import { mobileAuthUnavailableResponse, requireMobileSession } from "@/lib/platform/mobile-auth";
import { membershipFeatureKeys } from "@/modules/membership-policy/policy";
import { getEffectivePolicyForUser } from "@/modules/membership-policy/membership-policy.service";

export async function GET(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const session = await requireMobileSession(request);

  if (!session) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const policy = await getEffectivePolicyForUser(session.user.id);
  const capabilities = Object.fromEntries(
    membershipFeatureKeys
      .filter((featureKey) => featureKey !== "admin.portal")
      .map((featureKey) => [featureKey, Boolean(policy?.features[featureKey])])
  );

  return NextResponse.json({
    user: session.user,
    membership: policy
      ? {
          displayName: policy.displayName,
          tier: policy.tier,
          actualTier: policy.actualTier,
          promotionalAccess: policy.promotionalAccess
        }
      : null,
    capabilities
  });
}
