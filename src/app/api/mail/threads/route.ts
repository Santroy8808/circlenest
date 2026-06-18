import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { listMailThreads, sendMail } from "@/modules/mail/mail.service";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const folder = request.nextUrl.searchParams.get("folder") ?? "inbox";
  return NextResponse.json({ threads: await listMailThreads(session.user.id, folder) });
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json();
  const result = await sendMail(session.user.id, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ thread: result.thread }, { status: 201 });
}
