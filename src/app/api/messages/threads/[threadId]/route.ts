import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAuthorizedThread, getThreadParticipants, isGroupThread, threadOtherParticipant } from "@/lib/messages/thread-access";

export async function GET(_request: Request, context: { params: { threadId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getAuthorizedThread(context.params.threadId, session.user.id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const thread = access.thread;
  const other = threadOtherParticipant(thread, session.user.id);
  const participants = getThreadParticipants(thread).map((participant) => ({
    id: participant.id,
    username: participant.username,
    displayName: participant.fullName ?? participant.profile?.displayName ?? participant.username,
    avatarUrl: participant.profile?.avatarUrl ?? null,
  }));
  return NextResponse.json({
    id: thread.id,
    kind: thread.kind ?? "DIRECT",
    title: thread.title ?? null,
    updatedAt: thread.updatedAt,
    participants,
    other: isGroupThread(thread)
      ? null
      : {
          id: other.id,
          username: other.username,
          displayName: other.fullName ?? other.profile?.displayName ?? other.username,
          avatarUrl: other.profile?.avatarUrl ?? null,
        },
  });
}
