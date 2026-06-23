import { Readable } from "stream";
import { MediaVisibility } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/platform/db";
import { getR2Object } from "@/lib/platform/r2";

function toWebStream(body: unknown) {
  if (body && typeof (body as { transformToWebStream?: unknown }).transformToWebStream === "function") {
    return (body as { transformToWebStream: () => ReadableStream }).transformToWebStream();
  }

  return Readable.toWeb(body as Readable);
}

export async function GET(_request: NextRequest, { params }: { params: { mediaAssetId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const asset = await prisma.mediaAsset.findUnique({
    where: { id: params.mediaAssetId },
    select: {
      ownerUserId: true,
      storageKey: true,
      mimeType: true,
      originalName: true,
      visibility: true
    }
  });

  if (!asset) {
    return NextResponse.json({ error: "Media not found." }, { status: 404 });
  }

  const isOwner = asset.ownerUserId === session.user.id;
  const isVisibleToMember = asset.visibility === MediaVisibility.MEMBERS || asset.visibility === MediaVisibility.PUBLIC;

  if (!isOwner && !isVisibleToMember) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  try {
    const object = await getR2Object(asset.storageKey);
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
