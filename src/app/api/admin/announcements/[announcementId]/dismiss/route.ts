import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { dismissPublicAnnouncement } from "@/modules/admin-moderation/announcements.service";

export async function POST(_request: Request, props: { params: Promise<{ announcementId: string }> }) {
  const params = await props.params;
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const result = await dismissPublicAnnouncement(session.user.id, params.announcementId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ announcement: result.announcement, alreadyDismissed: result.alreadyDismissed });
}
