import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { getR2Object } from "@/lib/platform/r2";
import {
  getStorageArchiveViewForUser,
  releaseStorageArchiveView,
  requestStorageArchiveView
} from "@/modules/membership-policy/membership-storage-archive.service";

function toWebStream(body: unknown) {
  const transformer = body as { transformToWebStream?: () => ReadableStream };
  if (typeof transformer?.transformToWebStream === "function") return transformer.transformToWebStream();
  return Readable.toWeb(body as Readable);
}

function safeFileName(value: string | null) {
  return (value ?? "archived-file")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f"\\/]/g, "_")
    .trim()
    .slice(0, 180) || "archived-file";
}

async function currentUserId() {
  const session = await auth();
  if (!session?.user || session.user.revoked) return null;
  return (await getActiveAccountActor(session.user.id)).actorUserId;
}

export async function POST(_request: NextRequest, props: { params: Promise<{ itemId: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const { itemId } = await props.params;
  const result = await requestStorageArchiveView(userId, itemId);
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ itemId: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const { itemId } = await props.params;
  const result = await releaseStorageArchiveView(userId, itemId);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}

export async function GET(_request: NextRequest, props: { params: Promise<{ itemId: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const { itemId } = await props.params;
  const item = await getStorageArchiveViewForUser(userId, itemId);
  if (!item?.viewStorageKey || !item.viewMimeType) {
    return NextResponse.json({ error: "This archived file is not prepared for viewing yet." }, { status: 409 });
  }
  try {
    const object = await getR2Object(item.viewStorageKey, "private");
    if (!object.Body) throw new Error("Archive view is empty.");
    const disposition = item.viewMimeType.startsWith("image/") ? "inline" : "attachment";
    return new NextResponse(toWebStream(object.Body) as BodyInit, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `${disposition}; filename="${safeFileName(item.originalName)}"`,
        "Content-Type": item.viewMimeType,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return NextResponse.json({ error: "The prepared view is no longer available. Prepare it again." }, { status: 410 });
  }
}
