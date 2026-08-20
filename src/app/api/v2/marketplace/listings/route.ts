import { NextRequest, NextResponse } from "next/server";

import { createMarketplaceListing } from "@/modules/marketplace/marketplace-listings.service";
import { searchMarketplaceListings } from "@/modules/marketplace/marketplace-search.service";
import {
  marketplaceJsonBody,
  marketplaceLoginRequired,
  marketplaceResult,
  marketplaceSearchFromParams,
  marketplaceSessionUser,
  requireMarketplaceRollout,
} from "../_shared";

export async function GET(request: NextRequest) {
  const unavailable = await requireMarketplaceRollout();
  if (unavailable) return unavailable;
  try {
    return NextResponse.json(await searchMarketplaceListings(marketplaceSearchFromParams(request.nextUrl.searchParams)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid marketplace search." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const unavailable = await requireMarketplaceRollout();
  if (unavailable) return unavailable;
  const user = await marketplaceSessionUser();
  if (!user) return marketplaceLoginRequired();
  const body = await marketplaceJsonBody(request);
  if (!body.ok) return body.response;
  const envelope = body.value && typeof body.value === "object" && !Array.isArray(body.value)
    ? body.value as Record<string, unknown>
    : {};
  const listingInput = envelope.listing ?? body.value;
  const publish = envelope.publish === undefined ? true : envelope.publish === true;
  return marketplaceResult(await createMarketplaceListing(user.id, listingInput, { publish }), 201);
}
