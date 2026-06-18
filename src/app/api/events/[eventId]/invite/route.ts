import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { inviteUserToEvent } from "@/modules/events/events.service";

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json();
  const result = await inviteUserToEvent(session.user.id, params.eventId, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ invitation: result.invitation }, { status: 201 });
}
