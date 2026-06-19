import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createFeedbackTicket } from "@/modules/feedback-support/feedback-support.service";

export async function POST(request: NextRequest) {
  const session = await auth();
  const body = await request.json().catch(() => null);
  const result = await createFeedbackTicket(body, {
    userId: session?.user?.id,
    userAgent: request.headers.get("user-agent") ?? undefined
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    publicId: result.ticket.publicId,
    status: result.ticket.status
  });
}
