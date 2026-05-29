import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getArchiveFeedPosts } from "@/lib/feed/queries";
import { getStreamModeForUser } from "@/modules/stream/stream.service";

function parseBefore(value: string | null): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const before = parseBefore(url.searchParams.get("before"));
  const mode = await getStreamModeForUser(session.user.id);

  // Simulate a slower deep-archive retrieval path.
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const archive = await getArchiveFeedPosts(session.user.id, mode, before);
  return NextResponse.json(archive);
}
