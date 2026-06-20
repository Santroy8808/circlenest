import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/platform/mobile-auth";
import {
  getMyAuditorProfile,
  safeGetAuditorDetail,
  safeListAuditors,
  updateAuditorProfile
} from "@/modules/auditors/auditors.service";

export async function GET(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const username = request.nextUrl.searchParams.get("username");
  if (username) {
    const result = await safeGetAuditorDetail(username);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json({ auditor: result.auditor });
  }

  if (request.nextUrl.searchParams.get("mine") === "1") {
    return NextResponse.json(await getMyAuditorProfile(session.user.id));
  }

  return NextResponse.json({ auditors: await safeListAuditors({ query: request.nextUrl.searchParams.get("q") }) });
}

export async function POST(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const result = await updateAuditorProfile(session.user.id, await request.json().catch(() => ({})));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ profile: result.profile });
}
