import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolvePlatformApiFeatureAccess } from "@/modules/feature-flags/api-feature-access";
import { resolveMembershipRouteAccess } from "@/modules/membership-policy/route-access";
import { updateAuditorProfile } from "@/modules/auditors/auditors.service";

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const routeAccess = await resolveMembershipRouteAccess(session.user.id, "auditorProfileCreate", "api");
  if (!routeAccess.allowed) {
    return NextResponse.json({ error: routeAccess.error }, { status: routeAccess.status });
  }

  const featureAccess = await resolvePlatformApiFeatureAccess("directory.auditor_directory");
  if (!featureAccess.allowed) {
    return NextResponse.json(
      { error: featureAccess.error, code: featureAccess.code },
      { status: featureAccess.status }
    );
  }

  const body = await request.json();
  const result = await updateAuditorProfile(session.user.id, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ profile: result.profile });
}
