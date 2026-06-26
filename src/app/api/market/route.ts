import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { createMarketListing, listMarketListings } from "@/modules/market/market.service";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const listings = await listMarketListings({
    query: request.nextUrl.searchParams.get("q"),
    category: request.nextUrl.searchParams.get("category")
  });

  return NextResponse.json({ listings });
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  const body = await request.json();
  const result = await createMarketListing(actor.actorUserId, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ listing: result.listing }, { status: 201 });
}
