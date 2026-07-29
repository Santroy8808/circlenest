import { NextRequest, NextResponse } from "next/server";
import { mobileAuthUnavailableResponse, requireMobileSession } from "@/lib/platform/mobile-auth";
import { prisma } from "@/lib/platform/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function eventLine(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const deviceId = (request.nextUrl.searchParams.get("deviceId") ?? "").trim();
  const cursorText = (request.nextUrl.searchParams.get("cursor") ?? "0").trim();
  if (!/^\d+$/.test(cursorText)) {
    return NextResponse.json({ error: "Invalid event cursor." }, { status: 400 });
  }
  const device = await prisma.userDevice.findFirst({
    where: {
      id: deviceId,
      userId: session.user.id,
      revokedAt: null,
      commIdentityKey: { not: null }
    },
    select: { id: true }
  });
  if (!device) return NextResponse.json({ error: "Device is not registered." }, { status: 400 });

  const encoder = new TextEncoder();
  let cursor = BigInt(cursorText);
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // The browser may already have closed the stream.
        }
      };
      request.signal.addEventListener("abort", close, { once: true });
      controller.enqueue(encoder.encode(eventLine("connected", { cursor: cursor.toString() })));

      const pump = async () => {
        let heartbeatAt = Date.now();
        while (!closed) {
          try {
            const events = await prisma.thetaCommSyncEvent.findMany({
              where: { userId: session.user.id, id: { gt: cursor } },
              orderBy: { id: "asc" },
              take: 100
            });
            if (events.length > 0) {
              cursor = events.at(-1)!.id;
              controller.enqueue(
                encoder.encode(
                  eventLine("sync", {
                    cursor: cursor.toString(),
                    reasons: [...new Set(events.map((event) => event.kind))],
                    conversationIds: [
                      ...new Set(
                        events
                          .map((event) => event.conversationId)
                          .filter((id): id is string => Boolean(id))
                      )
                    ]
                  })
                )
              );
              heartbeatAt = Date.now();
            }

            const typing = await prisma.thetaCommTypingState.findMany({
              where: {
                userId: { not: session.user.id },
                expiresAt: { gt: new Date() },
                conversation: {
                  participants: {
                    some: {
                      userId: session.user.id,
                      leftAt: null,
                      removedAt: null
                    }
                  }
                }
              },
              select: { conversationId: true, userId: true, expiresAt: true }
            });
            if (typing.length > 0) {
              controller.enqueue(
                encoder.encode(
                  eventLine(
                    "typing",
                    typing.map((state) => ({
                      conversationId: state.conversationId,
                      userId: state.userId,
                      expiresAt: state.expiresAt.toISOString()
                    }))
                  )
                )
              );
            }
            if (Date.now() - heartbeatAt >= 15_000) {
              controller.enqueue(encoder.encode(eventLine("heartbeat", { cursor: cursor.toString() })));
              heartbeatAt = Date.now();
            }
            await new Promise((resolve) => setTimeout(resolve, 1_000));
          } catch {
            close();
          }
        }
      };
      void pump();
    },
    cancel() {
      closed = true;
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    }
  });
}
