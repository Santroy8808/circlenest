import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAuthorizedThread, threadOtherParticipant } from "@/lib/messages/thread-access";

export async function GET(_request: Request, context: { params: { threadId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getAuthorizedThread(context.params.threadId, session.user.id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const other = threadOtherParticipant(access.thread, session.user.id);
  return NextResponse.json({
    id: access.thread.id,
    updatedAt: access.thread.updatedAt,
    other: {
      id: other.id,
      username: other.username,
      displayName: other.profile?.displayName ?? other.fullName ?? other.username,
      avatarUrl: other.profile?.avatarUrl ?? null,
    },
  });
}
