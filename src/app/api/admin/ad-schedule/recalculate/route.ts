import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { forceRecalculateAdDisplaySchedules } from "@/modules/ads-credits/ads-credits.service";

export async function POST() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const result = await forceRecalculateAdDisplaySchedules(session.user.id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ view: result.view, runs: result.runs });
}
