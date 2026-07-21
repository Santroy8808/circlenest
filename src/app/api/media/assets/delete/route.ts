import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { readJsonRequest } from "@/lib/platform/api-request";
import { deleteGalleryAssets } from "@/modules/gallery-media-storage/gallery-media-storage.service";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user || session.user.revoked) {
      return NextResponse.json({ ok: false, error: "Login required." }, { status: 401 });
    }

    const body = await readJsonRequest(request);
    if (!body.ok) return body.response;

    const actor = await getActiveAccountActor(session.user.id);
    const result = await deleteGalleryAssets(actor.actorUserId, body.value);

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, ...(result.code ? { code: result.code } : {}) },
        { status: result.code === "DELETE_PASSWORD_REQUIRED" ? 403 : 400 }
      );
    }

    const status = result.completed ? "completed" as const : "queued" as const;
    return NextResponse.json({
      ok: true,
      status,
      destructiveActionRequestId: result.destructiveActionRequestId,
      platformJobId: result.platformJobId,
      mediaAssetIds: result.queuedMediaAssetIds
    }, { status: result.completed ? 200 : 202 });
  } catch (error) {
    console.error("[media.assets.delete] request failed", error);
    return NextResponse.json(
      { ok: false, error: "Could not queue photo deletion. Please try again." },
      { status: 500 }
    );
  }
}
