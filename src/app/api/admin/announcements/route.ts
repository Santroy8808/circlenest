import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listRecentPublicAnnouncements, publishPublicAnnouncement } from "@/modules/admin-moderation/announcements.service";

export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  return NextResponse.json({ announcements: await listRecentPublicAnnouncements(session.user.id) });
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const result = await publishPublicAnnouncement(session.user.id, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ announcement: result.announcement });
}
