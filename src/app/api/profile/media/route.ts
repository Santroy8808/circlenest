import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { readJsonRequest } from "@/lib/platform/api-request";
import { setProfileMediaFromGallery } from "@/modules/profile-identity/profile-identity.service";

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user || session.user.revoked) {
      return NextResponse.json({ error: "Login required." }, { status: 401 });
    }

    const body = await readJsonRequest(request);
    if (!body.ok) return body.response;

    const actor = await getActiveAccountActor(session.user.id);
    const result = await setProfileMediaFromGallery(actor.actorUserId, body.value);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, profile: result.profile, mediaUrl: result.mediaUrl });
  } catch (error) {
    console.error("[profile.media.put] request failed", error);
    return NextResponse.json({ error: "Could not update profile image. Please try again." }, { status: 500 });
  }
}
