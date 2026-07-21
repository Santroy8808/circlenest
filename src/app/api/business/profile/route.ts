import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveMembershipRouteAccess } from "@/modules/membership-policy/route-access";
import { upsertBusinessProfile } from "@/modules/business-storefront/business-storefront.service";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const routeAccess = await resolveMembershipRouteAccess(session.user.id, "businessManage", "api");
  if (!routeAccess.allowed) {
    return NextResponse.json({ error: routeAccess.error }, { status: routeAccess.status });
  }

  const body = await request.json();
  const result = await upsertBusinessProfile(session.user.id, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ profile: result.profile });
}
