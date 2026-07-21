import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ADMIN_NO_STORE_HEADERS,
  adminRouteErrorStatus,
  isAllowedConductAdminCommand,
  isRecord
} from "@/app/api/admin/_shared/admin-route-contract";
import { readJsonRequest } from "@/lib/platform/api-request";
import { isAdminUser } from "@/modules/admin-moderation/admin-moderation.service";
import {
  assignConductReport,
  transitionConductReport
} from "@/modules/admin-moderation/conduct-transitions.service";
import { getConductAdminView } from "@/modules/conduct-reporting/admin.service";
import { readConductAdminQuery } from "./conduct-admin-query";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.revoked) {
    return { ok: false as const, status: 401, code: "UNAUTHENTICATED", error: "Login required." };
  }
  if (!(await isAdminUser(session.user.id))) {
    return { ok: false as const, status: 403, code: "FORBIDDEN", error: "Admin access required." };
  }
  return { ok: true as const, user: session.user };
}

export async function GET(request: NextRequest) {
  const authorization = await requireAdmin();
  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.error, code: authorization.code },
      { status: authorization.status, headers: ADMIN_NO_STORE_HEADERS }
    );
  }
  const parsedQuery = readConductAdminQuery(request.nextUrl.searchParams);
  if (!parsedQuery.ok) {
    return NextResponse.json(
      { error: parsedQuery.error, code: "INVALID_QUERY", field: parsedQuery.field },
      { status: 422, headers: ADMIN_NO_STORE_HEADERS }
    );
  }
  return NextResponse.json(await getConductAdminView(parsedQuery.query), { headers: ADMIN_NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  const authorization = await requireAdmin();
  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.error, code: authorization.code },
      { status: authorization.status, headers: ADMIN_NO_STORE_HEADERS }
    );
  }
  const user = authorization.user;
  const body = await readJsonRequest(request, 128 * 1024);
  if (!body.ok) return body.response;
  const value = isRecord(body.value) ? body.value : {};

  if (!isAllowedConductAdminCommand(value.action)) {
    return NextResponse.json(
      {
        error: "That legacy conduct action is disabled until it has an atomic, versioned command service.",
        code: "VALIDATION_FAILED",
        field: "action"
      },
      { status: 422, headers: ADMIN_NO_STORE_HEADERS }
    );
  }
  const commandResult = value.action === "conduct-report.transition"
    ? await transitionConductReport(user.id, value)
    : await assignConductReport(user.id, value);
  if (!commandResult.ok) {
    return NextResponse.json(
      { error: commandResult.error.message, ...commandResult.error },
      {
        status: adminRouteErrorStatus(commandResult.error.code),
        headers: ADMIN_NO_STORE_HEADERS
      }
    );
  }
  return NextResponse.json(commandResult, { headers: ADMIN_NO_STORE_HEADERS });
}
