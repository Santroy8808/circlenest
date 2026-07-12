"use client";

import { ChatAttachmentKind, ChatThreadType } from "@prisma/client";
import Link from "next/link";
import { flushSync } from "react-dom";
import { useEffect, useRef, useState, useTransition } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { uploadWithResilientFallback } from "@/lib/client/resilient-upload";
import { AdminObjectId } from "@/components/admin/admin-object-id";
import { InAppImageViewer } from "@/components/media/in-app-image-viewer";
import {
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENTS_PER_MESSAGE,
  MAX_CHAT_TOTAL_ATTACHMENT_BYTES,
  type ChatAttachmentView,
  type ChatMessageView,
  type ChatPersonView,
  type ChatThreadDetailView,
  type ChatThreadView
} from "@/modules/chat-messages/types";

type QueuedAttachment = {
  id: string;
  file: File;
  previewUrl?: string;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};

const CHAT_MESSAGE_PAGE_SIZE = 60;
const contactFilters = [
  { key: "ALL", label: "All" },
  { key: "FRIENDS", label: "Friends" },
  { key: "FAMILY", label: "Family" },
  { key: "ACQUAINTANCE", label: "Acquaintance" },
  { key: "MEMBERS", label: "Members" }
] as const;

type ChatContactFilter = (typeof contactFilters)[number]["key"];

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function isBrowserPreviewImage(mimeType: string) {
  return /^image\/(jpeg|png|webp|gif)$/.test(mimeType);
}

function messagePreview(message?: ChatMessageView | null) {
  if (!message) return "No messages yet.";
  if (message.body) return message.body;
  return `${message.attachments.length} attachment${message.attachments.length === 1 ? "" : "s"}`;
}

function shortMessagePreview(message?: ChatMessageView | null) {
  const preview = messagePreview(message);
  return preview.length > 30 ? `${preview.slice(0, 30).trimEnd()}...` : preview;
}

function deliveryMark(message: ChatMessageView) {
  if (message.deliveryState === "FAILED") return "!";
  if (message.deliveryState === "SENDING") return "θ...";
  if (message.deliveryState === "SEEN") return "θθ";
  return "θ";
}

function activateKeyboard(event: KeyboardEvent<HTMLElement>, action: () => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
}

function ProfileNameLink({ person, children }: { person: ChatPersonView; children: ReactNode }) {
  return (
    <Link className="profile-inline-link" href={`/profile/${person.username}`} onClick={(event) => event.stopPropagation()}>
      {children}
    </Link>
  );
}

function ChatAvatar({ className = "chat-avatar", person }: { className?: string; person: ChatPersonView }) {
  return (
    <span className={className}>
      {person.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" src={person.avatarUrl} />
      ) : (
        initials(person.displayName)
      )}
    </span>
  );
}

function attachmentImageUrl(attachment: ChatAttachmentView) {
  return attachment.thumbnailUrl ?? attachment.publicUrl ?? (attachment.mediaAssetId ? `/api/media/assets/${attachment.mediaAssetId}` : "");
}

function handleChatImageError(event: React.SyntheticEvent<HTMLImageElement>, attachment: ChatAttachmentView) {
  const image = event.currentTarget;
  if (!attachment.mediaAssetId || image.dataset.mediaFallbackApplied === "true") return;

  image.dataset.mediaFallbackApplied = "true";
  image.src = `/api/media/assets/${attachment.mediaAssetId}`;
}

function hasImageFileSignature(attachment: ChatAttachmentView) {
  return (
    attachment.mimeType.toLowerCase().startsWith("image/") ||
    /\.(avif|gif|jpe?g|png|webp|bmp|svg)$/i.test(attachment.fileName)
  );
}

function isImageAttachment(attachment: ChatAttachmentView) {
  return (attachment.kind === "IMAGE" || hasImageFileSignature(attachment)) && attachmentImageUrl(attachment).trim().length > 0;
}

function uniquePeopleById(people: ChatPersonView[]) {
  const seen = new Set<string>();
  return people.filter((person) => {
    if (seen.has(person.id)) return false;
    seen.add(person.id);
    return true;
  });
}

function messagesLikelyMatch(serverMessage: ChatMessageView, localMessage: ChatMessageView) {
  const sameBody = (serverMessage.body ?? "").trim() === (localMessage.body ?? "").trim();
  const sameSender =
    serverMessage.sender.id === localMessage.sender.id ||
    serverMessage.sender.username === localMessage.sender.username ||
    serverMessage.sender.displayName === localMessage.sender.displayName;
  const sameAttachmentCount = serverMessage.attachments.length === localMessage.attachments.length;
  const serverTime = Date.parse(serverMessage.createdAt);
  const localTime = Date.parse(localMessage.createdAt);
  const closeInTime =
    Number.isFinite(serverTime) && Number.isFinite(localTime) ? Math.abs(serverTime - localTime) < 5 * 60 * 1000 : true;

  return sameBody && sameSender && sameAttachmentCount && closeInTime;
}

function isLocalMessage(message: ChatMessageView) {
  return message.id.startsWith("local-");
}

function dedupeMessages(messages: ChatMessageView[]) {
  const result: ChatMessageView[] = [];

  for (const message of messages) {
    if (result.some((existing) => existing.id === message.id)) continue;

    if (isLocalMessage(message) && result.some((existing) => !isLocalMessage(existing) && messagesLikelyMatch(existing, message))) {
      continue;
    }

    if (!isLocalMessage(message)) {
      const localDuplicateIndex = result.findIndex((existing) => isLocalMessage(existing) && messagesLikelyMatch(message, existing));
      if (localDuplicateIndex >= 0) {
        result.splice(localDuplicateIndex, 1);
      }
    }

    result.push(message);
  }

  return result;
}

function MessageImageAttachment({
  attachment,
  isMine
}: {
  attachment: ChatAttachmentView;
  isMine: boolean;
}) {
  const imageUrl = attachmentImageUrl(attachment);

  return (
    <figure className={isMine ? "chat-media-message is-mine" : "chat-media-message"}>
      <InAppImageViewer alt={attachment.fileName} className="chat-media-image-trigger" src={attachment.publicUrl ?? imageUrl}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={attachment.fileName} loading="lazy" onError={(event) => handleChatImageError(event, attachment)} src={imageUrl} />
      </InAppImageViewer>
      <figcaption className="chat-media-caption">{attachment.fileName}</figcaption>
    </figure>
  );
}

function MessageFileAttachment({
  attachment,
  isMine
}: {
  attachment: ChatAttachmentView;
  isMine: boolean;
}) {
  return (
    <a
      className={isMine ? "chat-file-message is-mine" : "chat-file-message"}
      href={attachment.publicUrl || "#"}
      target="_blank"
      rel="noreferrer"
    >
      <span>{attachment.fileName}</span>
      <span className="text-xs text-[var(--muted)]">{Number(attachment.sizeBytes).toLocaleString()} bytes</span>
    </a>
  );
}

export function MessagesClient({
  currentUserId,
  initialSelectedThread,
  initialThreads,
  isAdmin = false
}: {
  currentUserId: string;
  initialSelectedThread?: ChatThreadDetailView | null;
  initialThreads: ChatThreadView[];
  isAdmin?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const attachmentsRef = useRef<QueuedAttachment[]>([]);
  const prependScrollRef = useRef<{ height: number; top: number } | null>(null);
  const [threads, setThreads] = useState(initialThreads);
  const [selectedThread, setSelectedThread] = useState<ChatThreadDetailView | null>(initialSelectedThread ?? null);
  const [hasOlderMessages, setHasOlderMessages] = useState(
    (initialSelectedThread?.messages.length ?? 0) >= CHAT_MESSAGE_PAGE_SIZE
  );
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isSearchingContacts, setIsSearchingContacts] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [threadFilter, setThreadFilter] = useState<"ALL" | ChatThreadType>("ALL");
  const [contactFilter, setContactFilter] = useState<ChatContactFilter>("ALL");
  const [contacts, setContacts] = useState<ChatPersonView[]>([]);
  const [chatStartMode, setChatStartMode] = useState<"DIRECT" | "GROUP">("DIRECT");
  const [groupTitle, setGroupTitle] = useState("");
  const [groupParticipants, setGroupParticipants] = useState<ChatPersonView[]>([]);
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<QueuedAttachment[]>([]);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((attachment) => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      });
    };
  }, []);

  function mergePendingMessages(
    incomingThread: ChatThreadDetailView,
    currentThread: ChatThreadDetailView | null
  ): ChatThreadDetailView {
    if (!currentThread || currentThread.id !== incomingThread.id) {
      return { ...incomingThread, messages: dedupeMessages(incomingThread.messages) };
    }

    const pending = currentThread.messages.filter((message) => message.id.startsWith("local-"));
    if (pending.length === 0) return { ...incomingThread, messages: dedupeMessages(incomingThread.messages) };

    return {
      ...incomingThread,
      messages: dedupeMessages([
        ...incomingThread.messages,
        ...pending.filter((pendingMessage) => !incomingThread.messages.some((message) => messagesLikelyMatch(message, pendingMessage)))
      ])
    };
  }

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      if (!searchQuery.trim()) {
        setContacts([]);
        setIsSearchingContacts(false);
        return;
      }

      setIsSearchingContacts(true);
      try {
        const params = new URLSearchParams({ q: searchQuery, filter: contactFilter });
        const response = await fetch(`/api/chat/contacts?${params.toString()}`, { cache: "no-store" });
        const payload = (await response.json()) as { error?: string; people?: ChatPersonView[] };
        if (!response.ok) throw new Error(payload.error ?? "Could not search members.");
        setContacts(uniquePeopleById(payload.people ?? []));
      } catch (caught) {
        setContacts([]);
        setError(caught instanceof Error ? caught.message : "Could not search members.");
      } finally {
        setIsSearchingContacts(false);
      }
    }, 200);

    return () => window.clearTimeout(timeout);
  }, [contactFilter, searchQuery]);

  async function refreshThreads() {
    const response = await fetch("/api/chat/threads", { cache: "no-store" });
    if (response.ok) {
      const payload = (await response.json()) as { threads: ChatThreadView[] };
      setThreads(payload.threads ?? []);
    }
  }

  async function loadThread(threadId: string, options?: { silent?: boolean }) {
    if (!options?.silent) setError("");
    if (!options?.silent) setIsLoadingThread(true);
    try {
      const response = await fetch(`/api/chat/threads/${threadId}?limit=${CHAT_MESSAGE_PAGE_SIZE}`, { cache: "no-store" });
      const payload = (await response.json()) as { error?: string; thread?: ChatThreadDetailView };

      if (!response.ok || !payload.thread) {
        if (!options?.silent) setError(payload.error ?? "Could not open chat.");
        return;
      }

      setSelectedThread((current) => mergePendingMessages(payload.thread!, current));
      setHasOlderMessages(payload.thread.messages.length >= CHAT_MESSAGE_PAGE_SIZE);
      await fetch(`/api/chat/threads/${threadId}/read`, { method: "POST" });
      await refreshThreads();
    } catch (caught) {
      if (!options?.silent) setError(caught instanceof Error ? caught.message : "Could not open chat.");
    } finally {
      if (!options?.silent) setIsLoadingThread(false);
    }
  }

  async function loadOlderMessages() {
    if (!selectedThread || isLoadingOlder) return;
    const { oldestMessageId, oldestCreatedAt } = selectedThread.messagePage;
    if (!oldestMessageId || !oldestCreatedAt) {
      setHasOlderMessages(false);
      return;
    }

    const list = messageListRef.current;
    if (list) prependScrollRef.current = { height: list.scrollHeight, top: list.scrollTop };
    setIsLoadingOlder(true);
    setError("");
    try {
      const params = new URLSearchParams({
        beforeMessageId: oldestMessageId,
        beforeCreatedAt: oldestCreatedAt,
        limit: String(CHAT_MESSAGE_PAGE_SIZE)
      });
      const response = await fetch(`/api/chat/threads/${selectedThread.id}?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as { error?: string; thread?: ChatThreadDetailView };
      if (!response.ok || !payload.thread) throw new Error(payload.error ?? "Could not load earlier messages.");

      setSelectedThread((current) =>
        current && current.id === payload.thread!.id
          ? {
              ...payload.thread!,
              messages: dedupeMessages([...payload.thread!.messages, ...current.messages]),
              messagePage: {
                oldestMessageId: payload.thread!.messagePage.oldestMessageId ?? current.messagePage.oldestMessageId,
                oldestCreatedAt: payload.thread!.messagePage.oldestCreatedAt ?? current.messagePage.oldestCreatedAt,
                newestMessageId: current.messagePage.newestMessageId,
                newestCreatedAt: current.messagePage.newestCreatedAt
              }
            }
          : current
      );
      setHasOlderMessages(payload.thread.messages.length >= CHAT_MESSAGE_PAGE_SIZE);
    } catch (caught) {
      prependScrollRef.current = null;
      setError(caught instanceof Error ? caught.message : "Could not load earlier messages.");
    } finally {
      setIsLoadingOlder(false);
    }
  }

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshThreads();
    }, 7000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedThread?.id) return;

    const interval = window.setInterval(() => {
      void (async () => {
        const params = new URLSearchParams({ limit: String(CHAT_MESSAGE_PAGE_SIZE) });
        if (selectedThread.messagePage.newestMessageId && selectedThread.messagePage.newestCreatedAt) {
          params.set("afterMessageId", selectedThread.messagePage.newestMessageId);
          params.set("afterCreatedAt", selectedThread.messagePage.newestCreatedAt);
        }
        const response = await fetch(`/api/chat/threads/${selectedThread.id}?${params.toString()}`, { cache: "no-store" });
        const payload = (await response.json()) as { thread?: ChatThreadDetailView };
        if (response.ok && payload.thread) {
          setSelectedThread((current) => {
            if (!current || current.id !== payload.thread!.id) return current;
            const incoming = mergePendingMessages(payload.thread!, current);
            return {
              ...incoming,
              messages: dedupeMessages([...current.messages, ...incoming.messages]),
              messagePage: {
                oldestMessageId: current.messagePage.oldestMessageId ?? incoming.messagePage.oldestMessageId,
                oldestCreatedAt: current.messagePage.oldestCreatedAt ?? incoming.messagePage.oldestCreatedAt,
                newestMessageId: incoming.messagePage.newestMessageId ?? current.messagePage.newestMessageId,
                newestCreatedAt: incoming.messagePage.newestCreatedAt ?? current.messagePage.newestCreatedAt
              }
            };
          });
          await fetch(`/api/chat/threads/${selectedThread.id}/read`, { method: "POST" });
        }
      })();
    }, 3500);

    return () => window.clearInterval(interval);
  }, [selectedThread?.id, selectedThread?.messagePage.newestCreatedAt, selectedThread?.messagePage.newestMessageId]);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
    const prepend = prependScrollRef.current;
    if (prepend) {
      list.scrollTop = prepend.top + (list.scrollHeight - prepend.height);
      prependScrollRef.current = null;
      return;
    }
    list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [selectedThread?.id, selectedThread?.messages.length]);

  function startDirectChat(person: ChatPersonView) {
    setError("");
    startTransition(async () => {
      const response = await fetch("/api/chat/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: person.id })
      });
      const payload = (await response.json()) as { error?: string; thread?: ChatThreadDetailView };

      if (!response.ok || !payload.thread) {
        setError(payload.error ?? "Could not start chat.");
        return;
      }

      setSelectedThread(payload.thread);
      setHasOlderMessages(payload.thread.messages.length >= CHAT_MESSAGE_PAGE_SIZE);
      setSearchQuery("");
      await refreshThreads();
    });
  }

  function toggleGroupParticipant(person: ChatPersonView) {
    setGroupParticipants((current) =>
      current.some((participant) => participant.id === person.id)
        ? current.filter((participant) => participant.id !== person.id)
        : [...current, person]
    );
  }

  function createGroupChat() {
    const title = groupTitle.trim();
    if (!title || groupParticipants.length === 0) {
      setError("Name the group chat and add at least one member.");
      return;
    }

    setError("");
    startTransition(async () => {
      const response = await fetch("/api/chat/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: ChatThreadType.GROUP,
          title,
          participantUserIds: groupParticipants.map((participant) => participant.id)
        })
      });
      const payload = (await response.json()) as { error?: string; thread?: ChatThreadDetailView };

      if (!response.ok || !payload.thread) {
        setError(payload.error ?? "Could not start group chat.");
        return;
      }

      setSelectedThread(payload.thread);
      setHasOlderMessages(payload.thread.messages.length >= CHAT_MESSAGE_PAGE_SIZE);
      setChatStartMode("DIRECT");
      setGroupTitle("");
      setGroupParticipants([]);
      setSearchQuery("");
      await refreshThreads();
    });
  }

  function addFiles(files: FileList | File[]) {
    const candidates = Array.from(files);
    if (attachments.length + candidates.length > MAX_CHAT_ATTACHMENTS_PER_MESSAGE) {
      setError(`Attach at most ${MAX_CHAT_ATTACHMENTS_PER_MESSAGE} files to one message.`);
      return;
    }
    if (candidates.some((file) => file.size > MAX_CHAT_ATTACHMENT_BYTES)) {
      setError("Each attachment must be 20 MB or smaller.");
      return;
    }
    const totalBytes = [...attachments.map((attachment) => attachment.file), ...candidates].reduce(
      (total, file) => total + file.size,
      0
    );
    if (totalBytes > MAX_CHAT_TOTAL_ATTACHMENT_BYTES) {
      setError("Attachments for one message may total no more than 40 MB.");
      return;
    }

    setError("");
    const next = candidates.map((file) => ({
      id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
      file,
      previewUrl: isBrowserPreviewImage(file.type) ? URL.createObjectURL(file) : undefined,
      progress: 0,
      status: "queued" as const
    }));

    setAttachments((current) => [...current, ...next]);
  }

  function removeQueuedAttachment(id: string) {
    setAttachments((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((candidate) => candidate.id !== id);
    });
  }

  function clearQueuedAttachments() {
    setAttachments((current) => {
      current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      return [];
    });
  }

  function updateAttachment(id: string, patch: Partial<QueuedAttachment>) {
    setAttachments((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function uploadAttachment(item: QueuedAttachment) {
    updateAttachment(item.id, { status: "uploading", progress: 1, error: undefined });
    const intentResponse = await fetch("/api/chat/upload-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: item.file.name,
        mimeType: item.file.type || "application/octet-stream",
        sizeBytes: item.file.size
      })
    });
    const intent = (await intentResponse.json()) as {
      error?: string;
      intentId?: string;
      uploadHeaders?: Record<string, string>;
      uploadUrl?: string;
      storageKey?: string;
    };

    if (!intentResponse.ok || !intent.intentId || !intent.uploadHeaders || !intent.uploadUrl || !intent.storageKey) {
      throw new Error(intent.error ?? "Could not prepare attachment.");
    }

    await uploadWithResilientFallback({
      uploadUrl: intent.uploadUrl,
      storageKey: intent.storageKey,
      uploadHeaders: intent.uploadHeaders,
      file: item.file,
      onProgress: (progress) => updateAttachment(item.id, { progress })
    });

    const completeResponse = await fetch("/api/chat/complete-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intentId: intent.intentId,
        storageKey: intent.storageKey,
        fileName: item.file.name,
        mimeType: item.file.type || "application/octet-stream",
        sizeBytes: item.file.size
      })
    });
    const complete = (await completeResponse.json()) as { error?: string; attachment?: Omit<ChatAttachmentView, "id"> };

    if (!completeResponse.ok || !complete.attachment?.mediaAssetId) {
      throw new Error(complete.error ?? "Could not save attachment.");
    }

    updateAttachment(item.id, { status: "done", progress: 100 });
    return {
      ...complete.attachment,
      mediaAssetId: complete.attachment.mediaAssetId,
      publicUrl: complete.attachment.publicUrl ?? undefined
    };
  }

  function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedThread) return;

    setError("");
    const bodyToSend = body.trim();
    const optimisticId = `local-${crypto.randomUUID()}`;
    const optimisticSender =
      selectedThread.participants.find((participant) => participant.id === currentUserId) ??
      ({ id: currentUserId, username: "you", displayName: "You", avatarUrl: null, tagline: null } satisfies ChatPersonView);
    const optimisticAttachments: ChatAttachmentView[] = attachments.map((item) => ({
      id: `local-attachment-${item.id}`,
      kind: item.file.type.startsWith("image/") ? ChatAttachmentKind.IMAGE : ChatAttachmentKind.FILE,
      fileName: item.file.name,
      mimeType: item.file.type || "application/octet-stream",
      sizeBytes: String(item.file.size),
      publicUrl: item.previewUrl,
      thumbnailUrl: item.previewUrl,
      mediaAssetId: null
    }));

    if (bodyToSend || optimisticAttachments.length > 0) {
      flushSync(() => {
        setSelectedThread((current) =>
          current
            ? {
                ...current,
                messages: [
                  ...current.messages,
                  {
                    id: optimisticId,
                    body: bodyToSend,
                    createdAt: new Date().toISOString(),
                    sender: optimisticSender,
                    attachments: optimisticAttachments,
                    deliveryState: "SENDING"
                  }
                ]
              }
            : current
        );
        setBody("");
      });
    }

    startTransition(async () => {
      try {
        const uploaded = [];

        for (const item of attachments) {
          try {
            uploaded.push(await uploadAttachment(item));
          } catch (caught) {
            updateAttachment(item.id, {
              status: "error",
              error: caught instanceof Error ? caught.message : "Upload failed."
            });
            throw caught;
          }
        }

        const response = await fetch("/api/chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId: selectedThread.id,
            body: bodyToSend,
            attachments: uploaded.map((attachment) => ({ mediaAssetId: attachment.mediaAssetId }))
          })
        });
        const payload = (await response.json()) as { error?: string; message?: ChatMessageView };

        if (!response.ok || !payload.message) {
          throw new Error(payload.error ?? "Could not send message.");
        }

        const savedMessage = payload.message;
        setSelectedThread((current) =>
          current
            ? {
                ...current,
                messages: dedupeMessages(
                  current.messages.some((message) => message.id === optimisticId)
                    ? current.messages.map((message) =>
                        message.id === optimisticId
                          ? ({ ...savedMessage, deliveryState: savedMessage.deliveryState ?? "SENT" } as ChatMessageView)
                          : message
                      )
                    : [...current.messages, savedMessage as ChatMessageView]
                )
              }
            : current
        );
        await refreshThreads();
        clearQueuedAttachments();
      } catch (caught) {
        setSelectedThread((current) =>
          current
            ? {
                ...current,
                messages: current.messages.map((message) =>
                  message.id === optimisticId ? { ...message, deliveryState: "FAILED" } : message
                )
              }
            : current
        );
        setError(caught instanceof Error ? caught.message : "Could not send message.");
      }
    });
  }

  function sendOnEnter(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    const wantsNewLine = event.shiftKey || event.ctrlKey || event.altKey || event.metaKey;

    if (event.key !== "Enter" || wantsNewLine || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();

    if (isPending || (!body.trim() && attachments.length === 0)) {
      return;
    }

    event.currentTarget.form?.requestSubmit();
  }

  const cleanSearchQuery = searchQuery.trim().toLowerCase();
  const isSearching = cleanSearchQuery.length > 0;

  function threadMatchesSearch(thread: ChatThreadView) {
    if (!cleanSearchQuery) return true;
    const searchable = [
      thread.title,
      messagePreview(thread.lastMessage),
      ...thread.participants.flatMap((participant) => [participant.displayName, participant.username, participant.tagline ?? ""])
    ];

    return searchable.some((value) => value.toLowerCase().includes(cleanSearchQuery));
  }

  const filteredThreads = threads.filter((thread) => {
    const matchesType = threadFilter === "ALL" || thread.type === threadFilter;
    const matchesQuery = threadMatchesSearch(thread);
    return matchesType && matchesQuery;
  });
  const directThreadUserIdsInResults = new Set(
    filteredThreads
      .filter((thread) => thread.type === ChatThreadType.DIRECT)
      .flatMap((thread) => thread.participants.filter((participant) => participant.id !== currentUserId).map((participant) => participant.id))
  );
  const visibleContacts = uniquePeopleById(
    chatStartMode === "DIRECT"
      ? contacts.filter((person) => !directThreadUserIdsInResults.has(person.id))
      : contacts.filter((person) => !groupParticipants.some((participant) => participant.id === person.id))
  );

  function directThreadProfile(thread: ChatThreadView | ChatThreadDetailView) {
    if (thread.type !== ChatThreadType.DIRECT) return null;
    return thread.participants.find((participant) => participant.id !== currentUserId) ?? null;
  }

  function renderThreadCard(thread: ChatThreadView) {
    const profile = directThreadProfile(thread);
    return (
      <div
        className={selectedThread?.id === thread.id ? "chat-thread-card is-active" : "chat-thread-card"}
        key={thread.id}
        onClick={() => loadThread(thread.id)}
        onKeyDown={(event) => activateKeyboard(event, () => loadThread(thread.id))}
        role="button"
        tabIndex={0}
      >
        {profile ? (
          <ChatAvatar person={profile} />
        ) : (
          <span className="chat-avatar">{initials(thread.title)}</span>
        )}
        <span className="min-w-0 flex-1 text-left">
          {profile ? (
            <span className="block truncate font-semibold">{thread.title}</span>
          ) : (
            <span className="block truncate font-semibold">{thread.title}</span>
          )}
          <span className="block truncate text-sm text-[var(--muted)]">{shortMessagePreview(thread.lastMessage)}</span>
          <AdminObjectId id={thread.id} kind="Chat thread" visible={isAdmin} />
        </span>
        {thread.unread ? <span className="h-2 w-2 rounded-full bg-[var(--gold)]" /> : null}
      </div>
    );
  }

  function renderContactCard(person: ChatPersonView) {
    return (
      <div
        className={groupParticipants.some((participant) => participant.id === person.id) ? "chat-person-card is-selected" : "chat-person-card"}
        key={person.id}
        onClick={() => (chatStartMode === "GROUP" ? toggleGroupParticipant(person) : startDirectChat(person))}
        onKeyDown={(event) =>
          activateKeyboard(event, () => (chatStartMode === "GROUP" ? toggleGroupParticipant(person) : startDirectChat(person)))
        }
        role="button"
        tabIndex={0}
      >
        <ChatAvatar person={person} />
        <span className="min-w-0 text-left">
          <span className="block truncate font-semibold">{person.displayName}</span>
          <span className="block truncate text-sm text-[var(--muted)]">@{person.username}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="chat-layout-shell">
    <div className={selectedThread ? "chat-layout has-selected-thread" : "chat-layout"}>
      <aside className="chat-sidebar surface rounded-md">
        <section className="chat-panel-section">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Chats</p>
          <h2 className="mt-2 text-2xl font-semibold">Messages</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Fast direct and group conversations with members.</p>
          <input
            className="form-field mt-4"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search chats or members..."
            value={searchQuery}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {(["ALL", ChatThreadType.DIRECT, ChatThreadType.GROUP] as const).map((filter) => (
              <button
                className={threadFilter === filter ? "btn-primary px-3 py-2 text-sm" : "btn-secondary px-3 py-2 text-sm"}
                key={filter}
                onClick={() => setThreadFilter(filter)}
                type="button"
              >
                {filter === "ALL" ? "All" : filter === ChatThreadType.DIRECT ? "Direct" : "Groups"}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2" aria-label="Member search filters">
            {contactFilters.map((filter) => (
              <button
                className={contactFilter === filter.key ? "btn-primary px-3 py-2 text-xs" : "btn-secondary px-3 py-2 text-xs"}
                key={filter.key}
                onClick={() => setContactFilter(filter.key)}
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>
        </section>

        <section className="chat-thread-list">
          {error && !selectedThread ? (
            <p className="mb-3 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100" role="alert">
              {error}
            </p>
          ) : null}
          {!isSearching ? (
            <>
              {filteredThreads.length === 0 ? (
                <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-sm text-[var(--muted)]">No chats yet.</p>
              ) : null}
              {filteredThreads.map(renderThreadCard)}
            </>
          ) : (
            <>
              {chatStartMode !== "GROUP" ? (
                <div className="grid gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Existing chats</p>
                  {filteredThreads.length > 0 ? (
                    filteredThreads.map(renderThreadCard)
                  ) : (
                    <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-sm text-[var(--muted)]">No existing chats match.</p>
                  )}
                </div>
              ) : null}
              <div className={chatStartMode !== "GROUP" ? "mt-4 grid gap-2" : "grid gap-2"}>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">
                  {chatStartMode === "GROUP" ? "Members to add" : "People"}
                </p>
                {isSearchingContacts ? (
                  <p className="rounded-md border border-[var(--line)] p-4 text-sm text-[var(--muted)]" role="status">
                    Searching members...
                  </p>
                ) : visibleContacts.length > 0 ? (
                  visibleContacts.map(renderContactCard)
                ) : (
                  <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-sm text-[var(--muted)]">No people match.</p>
                )}
              </div>
            </>
          )}
        </section>

        <section className="chat-panel-section border-t border-[var(--line)]">
          <div className="chat-start-header">
            <p className="text-sm font-semibold text-[var(--gold)]">Start a chat</p>
            <div className="chat-start-toggle" aria-label="Chat type">
              <button
                className={chatStartMode === "DIRECT" ? "is-active" : ""}
                onClick={() => setChatStartMode("DIRECT")}
                type="button"
              >
                Direct
              </button>
              <button
                className={chatStartMode === "GROUP" ? "is-active" : ""}
                onClick={() => setChatStartMode("GROUP")}
                type="button"
              >
                Group
              </button>
            </div>
          </div>
          {chatStartMode === "GROUP" ? (
            <>
              <input
                className="form-field mt-3"
                onChange={(event) => setGroupTitle(event.target.value)}
                placeholder="Group chat name"
                value={groupTitle}
              />
              {groupParticipants.length > 0 ? (
                <div className="chat-group-selected">
                  {groupParticipants.map((participant) => (
                    <button key={participant.id} onClick={() => toggleGroupParticipant(participant)} type="button">
                      {participant.displayName}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
            Use the search above to find members. Empty search keeps your recent chats visible.
          </p>
          {chatStartMode === "GROUP" ? (
            <button
              className="btn-primary mt-3 w-full"
              disabled={isPending || groupParticipants.length === 0 || !groupTitle.trim()}
              onClick={createGroupChat}
              type="button"
            >
              Create group chat
            </button>
          ) : null}
        </section>
      </aside>

      <section className="chat-window surface rounded-md">
        {selectedThread ? (
          <>
            <header className="chat-window-header">
              <button className="chat-window-back" onClick={() => setSelectedThread(null)} type="button">
                Back to chats
              </button>
              <div className="chat-window-title-row">
                {directThreadProfile(selectedThread) ? (
                  <ProfileNameLink person={directThreadProfile(selectedThread)!}>
                    <ChatAvatar className="chat-window-avatar" person={directThreadProfile(selectedThread)!} />
                  </ProfileNameLink>
                ) : (
                  <span className="chat-window-avatar">{initials(selectedThread.title)}</span>
                )}
                <div className="min-w-0">
                <p className="text-sm uppercase tracking-[0.18em] text-[var(--gold)]">
                  {selectedThread.type === ChatThreadType.DIRECT ? "Direct chat" : "Group chat"}
                </p>
                {directThreadProfile(selectedThread) ? (
                  <Link className="profile-inline-link mt-1 block text-2xl font-semibold" href={`/profile/${directThreadProfile(selectedThread)!.username}`}>
                    {selectedThread.title}
                  </Link>
                ) : (
                  <h2 className="mt-1 text-2xl font-semibold">{selectedThread.title}</h2>
                )}
                <p className="mt-1 text-sm text-[var(--muted)]">{selectedThread.participants.length} participants</p>
                <AdminObjectId id={selectedThread.id} kind="Chat thread" visible={isAdmin} />
                </div>
              </div>
            </header>

            <div className="chat-message-list" ref={messageListRef}>
              {hasOlderMessages ? (
                <div className="flex justify-center pb-3">
                  <button
                    className="btn-secondary min-h-11 px-4 py-2 text-sm"
                    disabled={isLoadingOlder}
                    onClick={() => void loadOlderMessages()}
                    type="button"
                  >
                    {isLoadingOlder ? "Loading earlier messages..." : "Load earlier messages"}
                  </button>
                </div>
              ) : null}
              {isLoadingThread ? (
                <p className="py-3 text-center text-sm text-[var(--muted)]" role="status">
                  Opening chat...
                </p>
              ) : null}
              {selectedThread.messages.length === 0 ? (
                <div className="chat-empty-state">
                  <h3 className="text-xl font-semibold text-[var(--gold)]">No messages yet</h3>
                  <p className="mt-2 text-[var(--muted)]">Send the first note or drop in a file.</p>
                </div>
              ) : null}
              {selectedThread.messages.map((message) => {
                const isMine = message.sender.id === currentUserId;
                const imageAttachments = message.attachments.filter(isImageAttachment);
                const fileAttachments = message.attachments.filter((attachment) => !isImageAttachment(attachment));
                const bodyText = message.body ?? "";
                const hasBody = bodyText.trim().length > 0;
                return (
                  <div className={isMine ? "chat-message-group is-mine" : "chat-message-group"} key={message.id}>
                    {hasBody ? (
                      <article className={isMine ? "chat-message is-mine" : "chat-message"}>
                        <div className="chat-message-meta">
                          <ProfileNameLink person={message.sender}>{isMine ? "You" : message.sender.displayName}</ProfileNameLink>
                          <span className="chat-message-meta-right">
                            <AdminObjectId id={message.id} kind="Chat message" visible={isAdmin && !message.id.startsWith("local-")} />
                            <span>{new Date(message.createdAt).toLocaleString()}</span>
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap">{bodyText}</p>
                        {isMine ? (
                          <span className="chat-delivery-mark" title={message.deliveryState?.toLowerCase() ?? "sent"}>
                            {deliveryMark(message)}
                          </span>
                        ) : null}
                      </article>
                    ) : (
                      <div className="chat-media-meta">
                        <ProfileNameLink person={message.sender}>{isMine ? "You" : message.sender.displayName}</ProfileNameLink>
                        <AdminObjectId id={message.id} kind="Chat message" visible={isAdmin && !message.id.startsWith("local-")} />
                        <span>{new Date(message.createdAt).toLocaleString()}</span>
                      </div>
                    )}
                    {imageAttachments.map((attachment) => (
                      <MessageImageAttachment attachment={attachment} isMine={isMine} key={attachment.id} />
                    ))}
                    {fileAttachments.map((attachment) => (
                      <MessageFileAttachment attachment={attachment} isMine={isMine} key={attachment.id} />
                    ))}
                    {isMine && !hasBody ? (
                      <span className="chat-media-delivery" title={message.deliveryState?.toLowerCase() ?? "sent"}>
                        {deliveryMark(message)}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <form
              className="chat-composer"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                addFiles(event.dataTransfer.files);
              }}
              onSubmit={sendMessage}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[var(--gold)]">Reply</p>
                <button className="btn-secondary px-3 py-2 text-sm" data-tooltip="Attach files to this message." onClick={() => fileInputRef.current?.click()} type="button">
                  Attach
                </button>
                <input
                  ref={fileInputRef}
                  className="hidden"
                  multiple
                  onChange={(event) => {
                    if (event.target.files) addFiles(event.target.files);
                    event.currentTarget.value = "";
                  }}
                  type="file"
                />
              </div>
              <div className="chat-composer-row">
                <textarea
                  className="form-field chat-composer-input"
                  onChange={(event) => setBody(event.target.value)}
                  onKeyDown={sendOnEnter}
                  placeholder="Type a message, or drag files here..."
                  value={body}
                />
                <button
                  className="btn-primary send-logo-button chat-composer-send"
                  data-tooltip="Send this message."
                  disabled={isPending || (!body.trim() && attachments.length === 0)}
                  type="submit"
                >
                  <span aria-hidden="true" className="send-logo-icon" />
                  <span className="sr-only">{isPending ? "Sending..." : "Send"}</span>
                </button>
              </div>
              {attachments.length > 0 ? (
                <div className="mt-3 grid gap-2">
                  {attachments.map((item) => (
                    <div className={item.previewUrl ? "chat-upload-chip is-image" : "chat-upload-chip"} key={item.id}>
                      {item.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt={item.file.name} src={item.previewUrl} />
                      ) : (
                        <span className="chat-file-icon">File</span>
                      )}
                      <span className="min-w-0 flex-1 truncate">{item.file.name}</span>
                      <span className="text-xs text-[var(--muted)]">{item.progress}%</span>
                      {item.error ? <span className="text-xs text-red-300">{item.error}</span> : null}
                      <button
                        className="btn-secondary px-3 py-1 text-xs"
                        data-tooltip="Remove this attachment."
                        onClick={() => removeQueuedAttachment(item.id)}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {error ? <p className="mt-3 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
            </form>
          </>
        ) : (
          <div className="chat-empty-state h-full">
            <h2 className="text-3xl font-semibold text-[var(--gold)]">Select a chat</h2>
            <p className="mt-3 max-w-lg text-[var(--muted)]">
              Pick an existing conversation or search for a member on the left.
            </p>
          </div>
        )}
      </section>
    </div>
    </div>
  );
}
