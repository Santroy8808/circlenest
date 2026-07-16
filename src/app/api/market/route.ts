import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { diagnostics } from "@/lib/platform/logging";
import { readJsonRequest } from "@/lib/platform/api-request";
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

  try {
    const actor = await getActiveAccountActor(session.user.id);
    const body = await readJsonRequest(request);
    if (!body.ok) return body.response;

    const result = await createMarketListing(actor.actorUserId, body.value);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ listing: result.listing }, { status: 201 });
  } catch (error) {
    await diagnostics.error("market", "Could not create Market listing.", {
      userId: session.user.id,
      error: error instanceof Error ? error.message : "unknown"
    });
    return NextResponse.json({ error: "Could not create this listing right now. Please try again." }, { status: 500 });
  }
}
