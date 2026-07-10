import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { dismissPublicAnnouncement } from "@/modules/admin-moderation/announcements.service";

export async function POST(_request: Request, { params }: { params: { announcementId: string } }) {
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
