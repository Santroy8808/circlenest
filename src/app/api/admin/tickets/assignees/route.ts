import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listFeedbackTicketAssignees } from "@/modules/feedback-support/feedback-support.service";
import { FEEDBACK_NO_STORE_HEADERS, feedbackErrorStatus } from "@/modules/feedback-support/http";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401, headers: FEEDBACK_NO_STORE_HEADERS });
  }
  const result = await listFeedbackTicketAssignees(session.user.id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: feedbackErrorStatus(result.code), headers: FEEDBACK_NO_STORE_HEADERS }
    );
  }
  return NextResponse.json(result, { headers: FEEDBACK_NO_STORE_HEADERS });
}
