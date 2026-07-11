import { NextRequest, NextResponse } from "next/server";
import { readJsonRequest } from "@/lib/platform/api-request";
import { mobileAuthUnavailableResponse, requireMobileSession } from "@/lib/platform/mobile-auth";
import {
  INTERNAL_MAIL_UNAVAILABLE_ERROR,
  deleteMailThread,
  getMailThread,
  isInternalMailEnabled,
  listMailThreadsPage,
  markMailThreadRead,
  sendMail,
  setMailThreadArchived
} from "@/modules/mail/mail.service";

export async function GET(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;
  if (!isInternalMailEnabled()) return NextResponse.json({ error: INTERNAL_MAIL_UNAVAILABLE_ERROR }, { status: 404 });

  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const threadId = request.nextUrl.searchParams.get("threadId");
  if (threadId) {
    const cursor = request.nextUrl.searchParams.get("cursor");
    const rawLimit = request.nextUrl.searchParams.get("limit");
    const limit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined;
    const result = await getMailThread(session.user.id, threadId, {
      ...(cursor ? { cursor } : {}),
      ...(Number.isFinite(limit) ? { limit } : {})
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json({ thread: result.thread, nextCursor: result.thread.nextCursor });
  }

  const cursor = request.nextUrl.searchParams.get("cursor");
  const rawLimit = request.nextUrl.searchParams.get("limit");
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined;
  const page = await listMailThreadsPage(session.user.id, request.nextUrl.searchParams.get("folder") ?? "inbox", {
    ...(cursor ? { cursor } : {}),
    ...(Number.isFinite(limit) ? { limit } : {})
  });
  return NextResponse.json({ threads: page.threads, nextCursor: page.nextCursor });
}

export async function POST(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;
  if (!isInternalMailEnabled()) return NextResponse.json({ error: INTERNAL_MAIL_UNAVAILABLE_ERROR }, { status: 404 });

  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const parsedBody = await readJsonRequest(request, 256 * 1024);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.value as Record<string, unknown>;
  const result = await sendMail(session.user.id, {
    threadId: body.threadId,
    recipientUserIds: body.recipientUserIds ?? [],
    subject: body.subject,
    bodyText: body.bodyText,
    bodyHtml: "",
    attachments: body.attachments ?? []
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ thread: result.thread }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;
  if (!isInternalMailEnabled()) return NextResponse.json({ error: INTERNAL_MAIL_UNAVAILABLE_ERROR }, { status: 404 });

  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const parsedBody = await readJsonRequest(request, 8 * 1024);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.value as Record<string, unknown>;
  const threadId = typeof body.threadId === "string" ? body.threadId.trim() : "";
  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (!threadId) return NextResponse.json({ error: "Mail thread is required." }, { status: 400 });

  if (action === "read") {
    const result = await markMailThreadRead(session.user.id, threadId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json(result);
  }

  if (!["archive", "unarchive", "delete"].includes(action)) {
    return NextResponse.json({ error: "Unsupported mail action." }, { status: 400 });
  }

  const result =
    action === "delete"
      ? await deleteMailThread(session.user.id, threadId)
      : await setMailThreadArchived(session.user.id, threadId, action === "archive");
  return result.ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: result.error }, { status: 404 });
}
