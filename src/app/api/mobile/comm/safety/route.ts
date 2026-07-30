import {
  FeedbackTicketKind,
  FeedbackTicketSeverity,
  SocialRelationshipType
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { readJsonRequest } from "@/lib/platform/api-request";
import { prisma } from "@/lib/platform/db";
import {
  mobileAuthUnavailableResponse,
  requireMobileSession
} from "@/lib/platform/mobile-auth";
import { consumeRateLimit } from "@/lib/platform/rate-limit";
import { createFeedbackTicket } from "@/modules/feedback-support/feedback-support.service";
import { setSocialRelationship } from "@/modules/social-graph/social-graph.service";

export async function POST(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;
  const session = await requireMobileSession(request);
  if (!session) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }
  const body = await readJsonRequest(request, 24 * 1024);
  if (!body.ok) return body.response;
  const value =
    body.value && typeof body.value === "object" && !Array.isArray(body.value)
      ? (body.value as Record<string, unknown>)
      : {};

  if (value.action === "BLOCK" && typeof value.targetUserId === "string") {
    const result = await setSocialRelationship(session.user.id, {
      toUserId: value.targetUserId,
      type: SocialRelationshipType.BLOCK,
      note: "Blocked from Theta-Comm"
    });
    return result.ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (
    value.action !== "REPORT" ||
    typeof value.conversationId !== "string" ||
    typeof value.messageId !== "string" ||
    typeof value.reason !== "string"
  ) {
    return NextResponse.json({ error: "Invalid safety action." }, { status: 400 });
  }
  const rate = await consumeRateLimit({
    namespace: "theta-comm-safety-report",
    key: session.user.id,
    limit: 20,
    windowMs: 24 * 60 * 60 * 1000
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many reports were submitted. Try again later." },
      { status: 429 }
    );
  }
  const message = await prisma.encryptedChatMessage.findFirst({
    where: {
      id: value.messageId,
      threadId: value.conversationId,
      thread: {
        participants: {
          some: {
            userId: session.user.id,
            leftAt: null,
            removedAt: null
          }
        }
      }
    },
    select: {
      id: true,
      threadId: true,
      senderUserId: true,
      senderDeviceId: true,
      kind: true,
      createdAt: true
    }
  });
  if (!message) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }
  const description =
    typeof value.description === "string" && value.description.trim()
      ? value.description.trim().slice(0, 3000)
      : "No additional description was provided.";
  const ticket = await createFeedbackTicket(
    {
      title: `Theta-Comm safety report: ${value.reason}`.slice(0, 120),
      description: `${value.reason}\n\n${description}`,
      kind: FeedbackTicketKind.SAFETY_MODERATION,
      sourceRoute: "theta-comm",
      sourceEntityType: "theta_comm_message",
      sourceEntityId: message.id,
      pageContext: {
        conversationId: message.threadId,
        senderUserId: message.senderUserId,
        senderDeviceId: message.senderDeviceId,
        messageKind: message.kind,
        messageCreatedAt: message.createdAt.toISOString(),
        encryptedContentExcluded: true
      },
      severity: FeedbackTicketSeverity.high
    },
    {
      userId: session.user.id,
      userAgent: request.headers.get("user-agent") ?? undefined
    }
  );
  if (!ticket.ok) {
    return NextResponse.json(
      { error: ticket.error, code: ticket.code },
      { status: 400 }
    );
  }
  return NextResponse.json(
    { ok: true, ticketId: ticket.ticket.publicId },
    { status: 201 }
  );
}
