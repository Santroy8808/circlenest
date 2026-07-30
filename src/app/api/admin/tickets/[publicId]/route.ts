import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonRequest } from "@/lib/platform/api-request";
import {
  getFeedbackTicket,
  updateAdminFeedbackTicket
} from "@/modules/feedback-support/feedback-support.service";
import { FEEDBACK_NO_STORE_HEADERS, feedbackErrorStatus } from "@/modules/feedback-support/http";

export async function GET(_request: Request, props: { params: Promise<{ publicId: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401, headers: FEEDBACK_NO_STORE_HEADERS });
  }
  const result = await getFeedbackTicket(session.user.id, params.publicId);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: feedbackErrorStatus(result.code), headers: FEEDBACK_NO_STORE_HEADERS }
    );
  }
  return NextResponse.json(result, { headers: FEEDBACK_NO_STORE_HEADERS });
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ publicId: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401, headers: FEEDBACK_NO_STORE_HEADERS });
  }
  const body = await readJsonRequest(request, 32 * 1024);
  if (!body.ok) return body.response;
  const result = await updateAdminFeedbackTicket(session.user.id, params.publicId, body.value);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: feedbackErrorStatus(result.code), headers: FEEDBACK_NO_STORE_HEADERS }
    );
  }
  return NextResponse.json(
    {
      ok: true,
      publicId: result.ticket.publicId,
      version: result.ticket.version,
      status: result.ticket.status,
      finalMessageId: result.finalMessageId
    },
    { headers: FEEDBACK_NO_STORE_HEADERS }
  );
}
