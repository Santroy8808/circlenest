import { prisma } from "@/lib/db/prisma";

export async function getAuthorizedThread(threadId: string, userId: string) {
  const thread = await prisma.messageThread.findUnique({
    where: { id: threadId },
    include: {
      userA: {
        select: {
          id: true,
          username: true,
          fullName: true,
          profile: { select: { displayName: true, avatarUrl: true } },
        },
      },
      userB: {
        select: {
          id: true,
          username: true,
          fullName: true,
          profile: { select: { displayName: true, avatarUrl: true } },
        },
      },
    },
  });
  if (!thread) return { ok: false as const, status: 404 as const, error: "Thread not found" };
  if (thread.userAId !== userId && thread.userBId !== userId) {
    return { ok: false as const, status: 403 as const, error: "Forbidden" };
  }
  return { ok: true as const, thread };
}

export function threadOtherParticipant<
  T extends {
    userAId: string;
    userBId: string;
    userA: { id: string; username: string; fullName: string | null; profile: { displayName: string | null; avatarUrl: string | null } | null };
    userB: { id: string; username: string; fullName: string | null; profile: { displayName: string | null; avatarUrl: string | null } | null };
  },
>(thread: T, myUserId: string) {
  return thread.userAId === myUserId ? thread.userB : thread.userA;
}
