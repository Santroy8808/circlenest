import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ADMIN_NO_STORE_HEADERS } from "@/app/api/admin/_shared/admin-route-contract";
import { flagFeedPostForInvestigation } from "@/modules/conduct-reporting/investigation.service";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401, headers: ADMIN_NO_STORE_HEADERS });
  }
  const body = await request.json().catch(() => null);
  try {
    const result = await flagFeedPostForInvestigation(session.user.id, body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 422, headers: ADMIN_NO_STORE_HEADERS });
    }
    return NextResponse.json({
      ok: true,
      activeFlagCount: result.activeFlagCount,
      expiresAt: result.flag.expiresAt,
      investigation: result.investigation
    }, { headers: ADMIN_NO_STORE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to flag that post.";
    return NextResponse.json({ error: message }, { status: message === "Admin access required." ? 403 : 500, headers: ADMIN_NO_STORE_HEADERS });
  }
}
