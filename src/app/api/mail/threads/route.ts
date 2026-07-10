import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonRequest } from "@/lib/platform/api-request";
import { listMailThreadsPage, sendMail } from "@/modules/mail/mail.service";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const folder = request.nextUrl.searchParams.get("folder") ?? "inbox";
  const cursor = request.nextUrl.searchParams.get("cursor");
  const rawLimit = request.nextUrl.searchParams.get("limit");
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined;
  const page = await listMailThreadsPage(session.user.id, folder, {
    ...(cursor ? { cursor } : {}),
    ...(Number.isFinite(limit) ? { limit } : {})
  });
  return NextResponse.json({ threads: page.threads, nextCursor: page.nextCursor });
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await readJsonRequest(request, 256 * 1024);
  if (!body.ok) return body.response;
  const result = await sendMail(session.user.id, body.value);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ thread: result.thread }, { status: 201 });
}
