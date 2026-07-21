import { NextRequest, NextResponse } from "next/server";
import { mobileAuthUnavailableResponse, requireMobileSession } from "@/lib/platform/mobile-auth";
import { resolvePlatformApiFeatureAccess } from "@/modules/feature-flags/api-feature-access";
import { resolveMembershipRouteAccess } from "@/modules/membership-policy/route-access";
import {
  createChapter,
  createManuscript,
  getWriterAccessState,
  safeGetChapterDetail,
  safeGetManuscriptDetail,
  safeListManuscripts
} from "@/modules/writers-corner/writers-corner.service";

export async function GET(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

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

  const access = await getWriterAccessState(session.user.id);

  const chapterId = request.nextUrl.searchParams.get("chapterId");
  if (chapterId) {
    const result = await safeGetChapterDetail(session.user.id, chapterId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json({ chapter: result.chapter });
  }

  const manuscriptId = request.nextUrl.searchParams.get("manuscriptId");
  if (manuscriptId) {
    const result = await safeGetManuscriptDetail(session.user.id, manuscriptId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json({ manuscript: result.manuscript });
  }

  return NextResponse.json({
    access,
    manuscripts: await safeListManuscripts(session.user.id)
  });
}

export async function POST(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

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

  const body = await request.json().catch(() => ({}));
  const result = body.manuscriptId
    ? await createChapter(session.user.id, body.manuscriptId, body)
    : await createManuscript(session.user.id, body);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result, { status: 201 });
}
