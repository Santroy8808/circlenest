import { NextResponse } from "next/server";
import { submitExternalEventRsvp } from "@/modules/events/events.service";

export async function POST(request: Request, { params }: { params: { eventId: string } }) {
  const body = await request.json();
  const result = await submitExternalEventRsvp(params.eventId, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ created: result.created, rsvp: result.rsvp }, { status: result.created ? 201 : 200 });
}
