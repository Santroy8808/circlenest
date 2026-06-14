import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

function asText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function safeProfileSnapshot(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const source = input as Record<string, unknown>;
  const snapshot = {
    tier: asText(source.tier),
    country: asText(source.country),
    state: asText(source.state),
    city: asText(source.city),
  };
  return JSON.stringify(snapshot);
}

export async function POST(request: Request, { params }: { params: { campaignId: string } }) {
  const session = await auth();
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const eventType = asText(payload.eventType).toUpperCase();
  const anonymousSessionId = asText(payload.anonymousSessionId) || null;
  const profileSnapshotJson = safeProfileSnapshot(payload.profileSnapshot);

  const campaign = await prisma.adCampaign.findUnique({
    where: { id: params.campaignId },
    select: { id: true, status: true },
  });
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  if (eventType === "IMPRESSION") {
    const impression = await prisma.adImpression.create({
      data: {
        campaignId: campaign.id,
        viewerId: session?.user?.id ?? null,
        anonymousSessionId,
        placementSlot: asText(payload.placementSlot, "AD_STREAM"),
        viewStartedAt: new Date(),
        viewDurationMs: typeof payload.viewDurationMs === "number" ? Math.max(0, Math.trunc(payload.viewDurationMs)) : null,
        viewportJson: payload.viewport && typeof payload.viewport === "object" ? JSON.stringify(payload.viewport) : null,
        profileSnapshotJson,
      },
      select: { id: true },
    });
    return NextResponse.json({ recorded: true, type: eventType, id: impression.id });
  }

  if (eventType === "CLICK") {
    const click = await prisma.adClick.create({
      data: {
        campaignId: campaign.id,
        viewerId: session?.user?.id ?? null,
        anonymousSessionId,
        clickTarget: asText(payload.clickTarget, "UNKNOWN"),
        profileSnapshotJson,
      },
      select: { id: true },
    });
    return NextResponse.json({ recorded: true, type: eventType, id: click.id });
  }

  const engagement = await prisma.adEngagement.create({
    data: {
      campaignId: campaign.id,
      viewerId: session?.user?.id ?? null,
      eventType: eventType || "ENGAGEMENT",
      metadataJson: payload.metadata && typeof payload.metadata === "object" ? JSON.stringify(payload.metadata) : null,
    },
    select: { id: true },
  });
  return NextResponse.json({ recorded: true, type: eventType || "ENGAGEMENT", id: engagement.id });
}
