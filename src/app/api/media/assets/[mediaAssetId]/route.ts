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

function mediaFallbackSvg(label?: string | null) {
  const safeLabel = (label ?? "Image unavailable").replace(/[<>&"]/g, "");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640" role="img" aria-label="${safeLabel}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#101827"/>
      <stop offset="1" stop-color="#07101b"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" x2="1">
      <stop offset="0" stop-color="#ffe681"/>
      <stop offset="1" stop-color="#d6a82e"/>
    </linearGradient>
  </defs>
  <rect width="960" height="640" fill="url(#bg)"/>
  <rect x="28" y="28" width="904" height="584" rx="34" fill="none" stroke="#d6b24a" stroke-opacity=".42" stroke-width="3"/>
  <circle cx="480" cy="262" r="76" fill="none" stroke="url(#gold)" stroke-width="18"/>
  <path d="M404 334h152M480 186v152" stroke="url(#gold)" stroke-width="18" stroke-linecap="round" opacity=".72"/>
  <text x="480" y="442" fill="#f6d965" font-family="Arial, sans-serif" font-size="34" font-weight="700" text-anchor="middle">Image unavailable</text>
  <text x="480" y="488" fill="#b8c0d4" font-family="Arial, sans-serif" font-size="22" text-anchor="middle">The original media could not be loaded.</text>
</svg>`;
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
    if (asset.mimeType.startsWith("image/")) {
      return new NextResponse(mediaFallbackSvg(asset.originalName), {
        headers: {
          "Cache-Control": "private, max-age=60",
          "Content-Type": "image/svg+xml; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
          "X-Theta-Media-Fallback": "true"
        }
      });
    }

    return NextResponse.json({ error: "Could not load media." }, { status: 502 });
  }
}
