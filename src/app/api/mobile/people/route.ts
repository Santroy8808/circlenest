import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/platform/mobile-auth";
import { safeBrowsePeopleCards } from "@/modules/social-graph/social-graph.service";

export async function GET(request: NextRequest) {
  const session = await requireMobileSession(request);

  if (!session) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  return NextResponse.json({
    people: await safeBrowsePeopleCards(session.user.id, request.nextUrl.searchParams.get("q"))
  });
}
