import { NextRequest, NextResponse } from "next/server";
import { mobileAuthUnavailableResponse, requireMobileSession } from "@/lib/platform/mobile-auth";
import { safeGetMarketListingDetail, safeListMarketListings } from "@/modules/market/market.service";

export async function GET(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const listingId = request.nextUrl.searchParams.get("listingId");
  if (listingId) {
    const result = await safeGetMarketListingDetail(session.user.id, listingId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json({ listing: result.listing });
  }

  const kind = request.nextUrl.searchParams.get("kind");
  const listings = await safeListMarketListings({
    query: request.nextUrl.searchParams.get("q"),
    category: request.nextUrl.searchParams.get("category")
  });
  const productCategories = new Set([
    "BOOKS_MATERIALS",
    "COURSE_SUPPLIES",
    "AUDITING_SUPPLIES",
    "E_METERS",
    "FURNITURE_EQUIPMENT",
    "EVENTS_SUPPLIES",
    "OTHER"
  ]);
  const serviceCategories = new Set(["SERVICES", "BUSINESS_SERVICES"]);
  const scopedListings =
    kind === "products"
      ? listings.filter((listing) => productCategories.has(listing.category))
      : kind === "services"
        ? listings.filter((listing) => serviceCategories.has(listing.category))
        : listings;

  return NextResponse.json({ listings: scopedListings });
}
