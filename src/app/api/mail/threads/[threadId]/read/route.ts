import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { INTERNAL_MAIL_UNAVAILABLE_ERROR, isInternalMailEnabled, markMailThreadRead } from "@/modules/mail/mail.service";

export async function POST(_request: Request, { params }: { params: { threadId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }
  if (!isInternalMailEnabled()) return NextResponse.json({ error: INTERNAL_MAIL_UNAVAILABLE_ERROR }, { status: 404 });

  const result = await markMailThreadRead(session.user.id, params.threadId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json(result);
}
