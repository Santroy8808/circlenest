import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ADMIN_NO_STORE_HEADERS,
  adminHistoryQueryFromSearchParams,
  adminRouteErrorStatus
} from "@/app/api/admin/_shared/admin-route-contract";
import { isAdminUser } from "@/modules/admin-moderation/admin-moderation.service";
import { queryAdminAuditHistory } from "@/modules/admin-moderation/admin-history.service";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.revoked) {
    return NextResponse.json(
      { error: "Login required.", code: "UNAUTHENTICATED" },
      { status: 401, headers: ADMIN_NO_STORE_HEADERS }
    );
  }
  if (!(await isAdminUser(session.user.id))) {
    return NextResponse.json(
      { error: "Admin access required.", code: "FORBIDDEN" },
      { status: 403, headers: ADMIN_NO_STORE_HEADERS }
    );
  }

  const result = await queryAdminAuditHistory(
    session.user.id,
    adminHistoryQueryFromSearchParams(request.nextUrl.searchParams)
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: adminRouteErrorStatus(result.code), headers: ADMIN_NO_STORE_HEADERS }
    );
  }
  return NextResponse.json(result.page, { headers: ADMIN_NO_STORE_HEADERS });
}
