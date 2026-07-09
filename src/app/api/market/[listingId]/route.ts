import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { updateMarketListing } from "@/modules/market/market.service";

export async function PATCH(request: NextRequest, { params }: { params: { listingId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  const body = await request.json();
  const result = await updateMarketListing(actor.actorUserId, params.listingId, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ listing: result.listing });
}
