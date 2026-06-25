import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { subscribeToManuscript, unsubscribeFromManuscript } from "@/modules/writers-corner/writers-corner.service";

export async function POST(request: Request, { params }: { params: { manuscriptId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json();
  const result = await subscribeToManuscript(session.user.id, params.manuscriptId, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ subscription: result.subscription }, { status: 201 });
}

export async function DELETE(_request: Request, { params }: { params: { manuscriptId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const result = await unsubscribeFromManuscript(session.user.id, params.manuscriptId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
