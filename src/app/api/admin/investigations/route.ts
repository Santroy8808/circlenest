import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ADMIN_NO_STORE_HEADERS } from "@/app/api/admin/_shared/admin-route-contract";
import { isAdminUser } from "@/modules/admin-moderation/admin-moderation.service";
import {
  getAdminInvestigationWorkspace,
  startManualConductInvestigation
} from "@/modules/conduct-reporting/investigation.service";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.revoked) {
    return { ok: false as const, status: 401, error: "Login required." };
  }
  if (!(await isAdminUser(session.user.id))) {
    return { ok: false as const, status: 403, error: "Admin access required." };
  }
  return { ok: true as const, userId: session.user.id };
}

export async function GET(request: NextRequest) {
  const authorization = await requireAdmin();
  if (!authorization.ok) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status, headers: ADMIN_NO_STORE_HEADERS });
  }
  const subjectUserId = request.nextUrl.searchParams.get("subjectUserId")?.trim();
  if (!subjectUserId) {
    return NextResponse.json({ error: "Choose an account." }, { status: 422, headers: ADMIN_NO_STORE_HEADERS });
  }
  const tags = request.nextUrl.searchParams.getAll("tag");
  const workspace = await getAdminInvestigationWorkspace(authorization.userId, subjectUserId, {
    query: request.nextUrl.searchParams.get("query") || undefined,
    dateFrom: request.nextUrl.searchParams.get("dateFrom") || undefined,
    dateTo: request.nextUrl.searchParams.get("dateTo") || undefined,
    tags: tags.length ? tags : undefined,
    page: request.nextUrl.searchParams.get("page") || undefined,
    pageSize: request.nextUrl.searchParams.get("pageSize") || undefined
  });
  if (!workspace) {
    return NextResponse.json({ error: "That account was not found." }, { status: 404, headers: ADMIN_NO_STORE_HEADERS });
  }
  return NextResponse.json({ workspace }, { headers: ADMIN_NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  const authorization = await requireAdmin();
  if (!authorization.ok) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status, headers: ADMIN_NO_STORE_HEADERS });
  }
  const body = await request.json().catch(() => null);
  const result = await startManualConductInvestigation(authorization.userId, body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422, headers: ADMIN_NO_STORE_HEADERS });
  }
  return NextResponse.json(result, { headers: ADMIN_NO_STORE_HEADERS });
}
