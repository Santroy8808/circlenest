import { NextRequest, NextResponse } from "next/server";
import { readJsonRequest } from "@/lib/platform/api-request";
import { mobileAuthUnavailableResponse, requireMobileSession } from "@/lib/platform/mobile-auth";
import { thetaCommApiError } from "@/modules/theta-comm/api";
import { updateThetaCommConversationPreference } from "@/modules/theta-comm/conversation.service";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const body = await readJsonRequest(request, 16 * 1024);
  if (!body.ok) return body.response;
  try {
    return NextResponse.json(
      await updateThetaCommConversationPreference(
        session.user.id,
        params.conversationId,
        body.value
      )
    );
  } catch (error) {
    return thetaCommApiError(error);
  }
}
