import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonRequest } from "@/lib/platform/api-request";
import { requireDeletePasswordFromRequest } from "@/lib/platform/delete-protection";
import {
  INTERNAL_MAIL_UNAVAILABLE_ERROR,
  deleteMailThread,
  getMailThread,
  isInternalMailEnabled,
  setMailThreadArchived
} from "@/modules/mail/mail.service";

export async function GET(request: NextRequest, { params }: { params: { threadId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }
  if (!isInternalMailEnabled()) return NextResponse.json({ error: INTERNAL_MAIL_UNAVAILABLE_ERROR }, { status: 404 });

  const cursor = request.nextUrl.searchParams.get("cursor");
  const rawLimit = request.nextUrl.searchParams.get("limit");
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined;
  const result = await getMailThread(session.user.id, params.threadId, {
    ...(cursor ? { cursor } : {}),
    ...(Number.isFinite(limit) ? { limit } : {})
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ thread: result.thread, nextCursor: result.thread.nextCursor });
}

export async function PATCH(request: NextRequest, { params }: { params: { threadId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }
  if (!isInternalMailEnabled()) return NextResponse.json({ error: INTERNAL_MAIL_UNAVAILABLE_ERROR }, { status: 404 });

  const parsedBody = await readJsonRequest(request, 4 * 1024);
  if (!parsedBody.ok) return parsedBody.response;
  if (typeof parsedBody.value !== "object" || parsedBody.value === null || Array.isArray(parsedBody.value)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  const body = parsedBody.value as { archived?: unknown };
  if (typeof body.archived !== "boolean") {
    return NextResponse.json({ error: "Archived status is required." }, { status: 400 });
  }

  const result = await setMailThreadArchived(session.user.id, params.threadId, body.archived);
  return result.ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: result.error }, { status: 404 });
}

export async function DELETE(request: NextRequest, { params }: { params: { threadId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }
  if (!isInternalMailEnabled()) return NextResponse.json({ error: INTERNAL_MAIL_UNAVAILABLE_ERROR }, { status: 404 });

  const deletePasswordError = requireDeletePasswordFromRequest(request);
  if (deletePasswordError) return deletePasswordError;

  const result = await deleteMailThread(session.user.id, params.threadId);
  return result.ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: result.error }, { status: 404 });
}
