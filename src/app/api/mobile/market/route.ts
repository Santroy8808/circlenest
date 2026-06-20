import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/platform/mobile-auth";
import { safeGetMarketListingDetail, safeListMarketListings } from "@/modules/market/market.service";

export async function GET(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const listingId = request.nextUrl.searchParams.get("listingId");
  if (listingId) {
    const result = await safeGetMarketListingDetail(session.user.id, listingId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json({ listing: result.listing });
  }

  return NextResponse.json({
    listings: await safeListMarketListings({
      query: request.nextUrl.searchParams.get("q"),
      category: request.nextUrl.searchParams.get("category")
    })
  });
}
