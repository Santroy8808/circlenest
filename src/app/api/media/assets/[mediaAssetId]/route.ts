import { Readable } from "stream";
import { MediaVisibility } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { prisma } from "@/lib/platform/db";
import { requireMobileSession } from "@/lib/platform/mobile-auth";
import { getR2Object } from "@/lib/platform/r2";
import { timeServerStep } from "@/lib/platform/server-timing";

function toWebStream(body: unknown) {
  if (body && typeof (body as { transformToWebStream?: unknown }).transformToWebStream === "function") {
    return (body as { transformToWebStream: () => ReadableStream }).transformToWebStream();
  }

  return Readable.toWeb(body as Readable);
}

async function getMediaViewerUserId(request: NextRequest) {
  const session = await timeServerStep("api.media.asset.auth", auth());

  if (session?.user && !session.user.revoked) {
    const actor = await timeServerStep("api.media.asset.actor", getActiveAccountActor(session.user.id));
    return actor.actorUserId;
  }

  const mobileSession = await timeServerStep("api.media.asset.mobile-auth", requireMobileSession(request));
  return mobileSession?.user.id ?? null;
}

export async function GET(request: NextRequest, { params }: { params: { mediaAssetId: string } }) {
  const viewerUserId = await getMediaViewerUserId(request);

  if (!viewerUserId) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const asset = await timeServerStep("api.media.asset.lookup", prisma.mediaAsset.findUnique({
    where: { id: params.mediaAssetId },
    select: {
      ownerUserId: true,
      storageKey: true,
      mimeType: true,
      originalName: true,
      visibility: true
    }
  }));

  if (!asset) {
    return NextResponse.json({ error: "Media not found." }, { status: 404 });
  }

  const isOwner = asset.ownerUserId === viewerUserId;
  const isVisibleToMember = asset.visibility === MediaVisibility.MEMBERS || asset.visibility === MediaVisibility.PUBLIC;

  if (!isOwner && !isVisibleToMember) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  try {
    const object = await timeServerStep("api.media.asset.r2", getR2Object(asset.storageKey), { mimeType: asset.mimeType });
    const headers = new Headers({
      "Cache-Control": "private, max-age=300",
      "Content-Type": asset.mimeType,
      "X-Content-Type-Options": "nosniff"
    });

    if (asset.originalName) {
      headers.set("Content-Disposition", `inline; filename="${asset.originalName.replace(/"/g, "")}"`);
    }

    return new NextResponse(toWebStream(object.Body) as BodyInit, { headers });
  } catch (error) {
    console.error("[media.assets.get]", error);
    return NextResponse.json({ error: "Could not load media." }, { status: 502 });
  }
}
