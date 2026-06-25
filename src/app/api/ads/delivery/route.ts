import { AdDeliveryEventType, AdPlacement } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { logAdDelivery } from "@/modules/ads-credits/ads-credits.service";

function parsePlacement(value: unknown) {
  if (typeof value === "string" && Object.values(AdPlacement).includes(value as AdPlacement)) {
    return value as AdPlacement;
  }

  return AdPlacement.RIGHT_STREAM;
}

function parseEventType(value: unknown) {
  if (typeof value === "string" && Object.values(AdDeliveryEventType).includes(value as AdDeliveryEventType)) {
    return value as AdDeliveryEventType;
  }

  return null;
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    campaignId?: unknown;
    placement?: unknown;
    eventType?: unknown;
    metadata?: unknown;
  } | null;
  const campaignId = typeof body?.campaignId === "string" ? body.campaignId : "";
  const eventType = parseEventType(body?.eventType);
  const metadata =
    typeof body?.metadata === "object" && body.metadata !== null && !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, unknown>)
      : undefined;

  if (!campaignId || !eventType) {
    return NextResponse.json({ error: "Invalid ad delivery event." }, { status: 400 });
  }

  const result = await logAdDelivery({
    campaignId,
    viewerUserId: session.user.id,
    placement: parsePlacement(body?.placement),
    eventType,
    metadata
  });

  return NextResponse.json({ ok: true, logged: result.logged });
}
