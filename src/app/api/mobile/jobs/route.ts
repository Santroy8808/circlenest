import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/platform/mobile-auth";
import { safeGetJobListingDetail, safeListJobListings } from "@/modules/jobs/jobs.service";

export async function GET(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const listingId = request.nextUrl.searchParams.get("listingId");
  if (listingId) {
    const result = await safeGetJobListingDetail(session.user.id, listingId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json({ job: result.job });
  }

  return NextResponse.json({
    jobs: await safeListJobListings({
      query: request.nextUrl.searchParams.get("q"),
      category: request.nextUrl.searchParams.get("category")
    })
  });
}
