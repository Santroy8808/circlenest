import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { cancelPublicAnnouncement } from "@/modules/admin-moderation/announcements.service";

export async function POST(_request: Request, props: { params: Promise<{ announcementId: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const params = await props.params;
  const result = await cancelPublicAnnouncement(session.user.id, params.announcementId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ announcement: result.announcement, alreadyCancelled: result.alreadyCancelled });
}
