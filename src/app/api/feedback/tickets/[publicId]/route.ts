import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getFeedbackTicket } from "@/modules/feedback-support/feedback-support.service";
import { FEEDBACK_NO_STORE_HEADERS, feedbackErrorStatus } from "@/modules/feedback-support/http";
import { isFeatureEnabled } from "@/modules/feature-flags/feature-flags.service";

export async function GET(_request: Request, { params }: { params: { publicId: string } }) {
  const session = await auth();
  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401, headers: FEEDBACK_NO_STORE_HEADERS });
  }
  if (!(await isFeatureEnabled("support.feedback_center"))) {
    return NextResponse.json(
      { error: "Feedback is temporarily unavailable." },
      { status: 503, headers: FEEDBACK_NO_STORE_HEADERS }
    );
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
