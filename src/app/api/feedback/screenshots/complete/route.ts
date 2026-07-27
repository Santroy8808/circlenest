import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonRequest } from "@/lib/platform/api-request";
import { completeFeedbackScreenshotUpload } from "@/modules/feedback-support/feedback-support.service";
import { feedbackErrorStatus } from "@/modules/feedback-support/http";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }
  const body = await readJsonRequest(request, 8 * 1024);
  if (!body.ok) return body.response;
  const result = await completeFeedbackScreenshotUpload(session.user.id, body.value);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: feedbackErrorStatus(result.code) }
    );
  }
  return NextResponse.json(result);
}
