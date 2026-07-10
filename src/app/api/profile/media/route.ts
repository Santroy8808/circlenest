import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { setProfileMediaFromGallery } from "@/modules/profile-identity/profile-identity.service";

export async function PUT(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json();
  const actor = await getActiveAccountActor(session.user.id);
  const result = await setProfileMediaFromGallery(actor.actorUserId, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ profile: result.profile, mediaUrl: result.mediaUrl });
}
