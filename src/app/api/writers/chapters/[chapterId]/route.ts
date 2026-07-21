import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolvePlatformApiFeatureAccess } from "@/modules/feature-flags/api-feature-access";
import { resolveMembershipRouteAccess } from "@/modules/membership-policy/route-access";
import { updateChapter } from "@/modules/writers-corner/writers-corner.service";

export async function PATCH(request: Request, { params }: { params: { chapterId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const routeAccess = await resolveMembershipRouteAccess(session.user.id, "writersCreate", "api");
  if (!routeAccess.allowed) {
    return NextResponse.json({ error: routeAccess.error }, { status: routeAccess.status });
  }

  const featureAccess = await resolvePlatformApiFeatureAccess("publishing.writers_corner");
  if (!featureAccess.allowed) {
    return NextResponse.json(
      { error: featureAccess.error, code: featureAccess.code },
      { status: featureAccess.status }
    );
  }

  const body = await request.json();
  const result = await updateChapter(session.user.id, params.chapterId, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ chapter: result.chapter });
}
