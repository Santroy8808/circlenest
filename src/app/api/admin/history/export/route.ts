import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ADMIN_NO_STORE_HEADERS,
  adminRouteErrorStatus
} from "@/app/api/admin/_shared/admin-route-contract";
import { readJsonRequest } from "@/lib/platform/api-request";
import { isAdminUser } from "@/modules/admin-moderation/admin-moderation.service";
import { exportAdminHistory } from "@/modules/admin-moderation/admin-history.service";
import type { AdminHistoryExportRequest } from "@/modules/admin-moderation/admin-history.service";

export async function POST(request: NextRequest) {
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

  const body = await readJsonRequest(request, 32 * 1024);
  if (!body.ok) return body.response;
  const result = await exportAdminHistory(session.user.id, body.value as AdminHistoryExportRequest);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: adminRouteErrorStatus(result.code), headers: ADMIN_NO_STORE_HEADERS }
    );
  }

  return new NextResponse(result.export.content, {
    status: 200,
    headers: {
      ...ADMIN_NO_STORE_HEADERS,
      "content-type": result.export.mimeType,
      "content-disposition": `attachment; filename="${result.export.fileName}"`,
      "x-theta-export-id": result.export.exportId,
      "x-theta-export-sha256": result.export.sha256,
      "x-theta-export-record-count": String(result.export.recordCount),
      "x-theta-export-truncated": String(result.export.truncated)
    }
  });
}
