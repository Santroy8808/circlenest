import { ChatThreadType } from "@prisma/client";
import type { ChatThreadView } from "@/modules/chat-messages/types";

export function homeCommContactScope(includeAllMembers: boolean) {
  return includeAllMembers ? "ALL" : "RELATIONSHIPS";
}

export function filterHomeCommThreads(threads: ChatThreadView[], query: string) {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) return threads;

  return threads.filter((thread) => {
    const participantMatch = thread.participants.some((participant) =>
      participant.displayName.toLowerCase().includes(cleanQuery) ||
      participant.username.toLowerCase().includes(cleanQuery)
    );
    const messageMatch = Boolean(
      thread.lastMessage?.body?.toLowerCase().includes(cleanQuery) ||
      thread.lastMessage?.attachments.some((attachment) =>
        attachment.fileName.toLowerCase().includes(cleanQuery)
      )
    );

    return thread.title.toLowerCase().includes(cleanQuery) || participantMatch || messageMatch;
  });
}

export function contactsWithoutExistingDirectChats<T extends { id: string }>(
  contacts: T[],
  threads: ChatThreadView[],
  currentUserId: string
) {
  const directPeerIds = new Set(
    threads
      .filter((thread) => thread.type === ChatThreadType.DIRECT)
      .flatMap((thread) => thread.participants)
      .filter((participant) => participant.id !== currentUserId)
      .map((participant) => participant.id)
  );

  return contacts.filter((contact) => !directPeerIds.has(contact.id));
}
