import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { completeMarketPhotoUpload } from "@/modules/market/market.service";

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await completeMarketPhotoUpload(session.user.id, body);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ asset: result.asset });
  } catch (error) {
    console.error("[market.photos.complete-upload]", error);
    return NextResponse.json({ error: "Could not save listing photo record." }, { status: 500 });
  }
}
