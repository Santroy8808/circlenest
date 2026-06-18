import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { cancelEvent } from "@/modules/events/events.service";

export async function POST(_request: Request, { params }: { params: { eventId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const result = await cancelEvent(session.user.id, params.eventId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ event: result.event });
}
