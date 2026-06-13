import { prisma } from "@/lib/db/prisma";

const participantSelect = {
  userId: true,
  role: true,
  user: {
    select: {
      id: true,
      username: true,
      fullName: true,
      profile: { select: { displayName: true, avatarUrl: true } },
    },
  },
} as const;

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
      createdBy: {
        select: {
          id: true,
          username: true,
          fullName: true,
          profile: { select: { displayName: true, avatarUrl: true } },
        },
      },
      participants: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              fullName: true,
              profile: { select: { displayName: true, avatarUrl: true } },
            },
          },
        },
      },
    },
  });
  if (!thread) return { ok: false as const, status: 404 as const, error: "Thread not found" };

  const isParticipant =
    thread.participants.some((participant) => participant.userId === userId) ||
    thread.userAId === userId ||
    thread.userBId === userId;
  if (!isParticipant) {
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

export function isGroupThread(thread: { kind?: string | null }) {
  return (thread.kind ?? "DIRECT") === "GROUP";
}

export function getThreadParticipants<
  T extends {
    kind?: string | null;
    userA: { id: string; username: string; fullName: string | null; profile: { displayName: string | null; avatarUrl: string | null } | null };
    userB: { id: string; username: string; fullName: string | null; profile: { displayName: string | null; avatarUrl: string | null } | null };
    participants?: Array<{ userId: string; user: { id: string; username: string; fullName: string | null; profile: { displayName: string | null; avatarUrl: string | null } | null } }>;
  },
>(thread: T) {
  if (isGroupThread(thread)) {
    return (thread.participants ?? []).map((participant) => participant.user);
  }
  return [thread.userA, thread.userB];
}
