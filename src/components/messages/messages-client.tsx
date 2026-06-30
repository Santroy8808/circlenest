"use client";

import { ChatAttachmentKind, ChatThreadType } from "@prisma/client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { uploadWithResilientFallback } from "@/lib/client/resilient-upload";
import type {
  ChatAttachmentView,
  ChatMessageView,
  ChatPersonView,
  ChatThreadDetailView,
  ChatThreadView
} from "@/modules/chat-messages/types";

type QueuedAttachment = {
  id: string;
  file: File;
  previewUrl?: string;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};

const CHAT_THUMBNAIL_MAX_EDGE = 420;

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

function loadImageElement(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not preview image attachment."));
    image.src = url;
  });
}

async function createChatThumbnail(file: File) {
  if (!isBrowserPreviewImage(file.type)) return null;

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImageElement(objectUrl);
    const scale = Math.min(1, CHAT_THUMBNAIL_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) return null;

    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));
    if (!blob) return null;

    const fileName = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${fileName}-thumb.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
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

function attachmentImageUrl(attachment: ChatAttachmentView) {
  return attachment.thumbnailUrl ?? attachment.publicUrl ?? "";
}

function isImageAttachment(attachment: ChatAttachmentView) {
  return attachment.kind === "IMAGE" && attachmentImageUrl(attachment).trim().length > 0;
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
    <a
      className={isMine ? "chat-media-message is-mine" : "chat-media-message"}
      href={attachment.publicUrl || imageUrl}
      target="_blank"
      rel="noreferrer"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={attachment.fileName} loading="lazy" src={imageUrl} />
      <span className="chat-media-caption">{attachment.fileName}</span>
    </a>
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
  initialThreads
}: {
  currentUserId: string;
  initialSelectedThread?: ChatThreadDetailView | null;
  initialThreads: ChatThreadView[];
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const attachmentsRef = useRef<QueuedAttachment[]>([]);
  const [threads, setThreads] = useState(initialThreads);
  const [selectedThread, setSelectedThread] = useState<ChatThreadDetailView | null>(initialSelectedThread ?? null);
  const [threadQuery, setThreadQuery] = useState("");
  const [threadFilter, setThreadFilter] = useState<"ALL" | ChatThreadType>("ALL");
  const [contactQuery, setContactQuery] = useState("");
  const [contacts, setContacts] = useState<ChatPersonView[]>([]);
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
    if (!currentThread || currentThread.id !== incomingThread.id) return incomingThread;

    const pending = currentThread.messages.filter((message) => message.id.startsWith("local-"));
    if (pending.length === 0) return incomingThread;

    return {
      ...incomingThread,
      messages: [
        ...incomingThread.messages,
        ...pending.filter((pendingMessage) => {
          return !incomingThread.messages.some((message) => {
            const sameBody = (message.body ?? "") === (pendingMessage.body ?? "");
            const sameSender = message.sender.id === pendingMessage.sender.id;
            const sameAttachmentCount = message.attachments.length === pendingMessage.attachments.length;
            return sameBody && sameSender && sameAttachmentCount;
          });
        })
      ]
    };
  }

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      const response = await fetch(`/api/chat/contacts?q=${encodeURIComponent(contactQuery)}`, { cache: "no-store" });
      if (response.ok) {
        const payload = (await response.json()) as { people: ChatPersonView[] };
        setContacts(payload.people ?? []);
      }
    }, 200);

    return () => window.clearTimeout(timeout);
  }, [contactQuery]);

  async function refreshThreads() {
    const response = await fetch("/api/chat/threads", { cache: "no-store" });
    if (response.ok) {
      const payload = (await response.json()) as { threads: ChatThreadView[] };
      setThreads(payload.threads ?? []);
    }
  }

  async function loadThread(threadId: string, options?: { silent?: boolean }) {
    if (!options?.silent) setError("");
    const response = await fetch(`/api/chat/threads/${threadId}`, { cache: "no-store" });
    const payload = (await response.json()) as { error?: string; thread?: ChatThreadDetailView };

    if (!response.ok || !payload.thread) {
      if (!options?.silent) setError(payload.error ?? "Could not open chat.");
      return;
    }

    setSelectedThread((current) => mergePendingMessages(payload.thread!, current));
    await fetch(`/api/chat/threads/${threadId}/read`, { method: "POST" });
    await refreshThreads();
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
        const response = await fetch(`/api/chat/threads/${selectedThread.id}`, { cache: "no-store" });
        const payload = (await response.json()) as { thread?: ChatThreadDetailView };
        if (response.ok && payload.thread) {
          setSelectedThread((current) => mergePendingMessages(payload.thread!, current));
          await fetch(`/api/chat/threads/${selectedThread.id}/read`, { method: "POST" });
        }
      })();
    }, 3500);

    return () => window.clearInterval(interval);
  }, [selectedThread?.id]);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
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
      setContactQuery("");
      await refreshThreads();
    });
  }

  function addFiles(files: FileList | File[]) {
    const next = Array.from(files).map((file) => ({
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
    let thumbnailStorageKey: string | undefined;
    const intentResponse = await fetch("/api/chat/upload-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: item.file.name,
        mimeType: item.file.type || "application/octet-stream",
        sizeBytes: item.file.size
      })
    });
    const intent = (await intentResponse.json()) as { error?: string; uploadUrl?: string; storageKey?: string };

    if (!intentResponse.ok || !intent.uploadUrl || !intent.storageKey) {
      throw new Error(intent.error ?? "Could not prepare attachment.");
    }

    await uploadWithResilientFallback({
      uploadUrl: intent.uploadUrl,
      storageKey: intent.storageKey,
      file: item.file,
      onProgress: (progress) => updateAttachment(item.id, { progress })
    });

    try {
      const thumbnailFile = await createChatThumbnail(item.file);

      if (thumbnailFile) {
        updateAttachment(item.id, { progress: 94 });
        const thumbnailIntentResponse = await fetch("/api/chat/upload-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: thumbnailFile.name,
            mimeType: thumbnailFile.type,
            sizeBytes: thumbnailFile.size
          })
        });
        const thumbnailIntent = (await thumbnailIntentResponse.json()) as { error?: string; uploadUrl?: string; storageKey?: string };

        if (thumbnailIntentResponse.ok && thumbnailIntent.uploadUrl && thumbnailIntent.storageKey) {
          await uploadWithResilientFallback({
            uploadUrl: thumbnailIntent.uploadUrl,
            storageKey: thumbnailIntent.storageKey,
            file: thumbnailFile,
            onProgress: () => updateAttachment(item.id, { progress: 98 })
          });
          thumbnailStorageKey = thumbnailIntent.storageKey;
        }
      }
    } catch {
      thumbnailStorageKey = undefined;
    }

    const completeResponse = await fetch("/api/chat/complete-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storageKey: intent.storageKey,
        thumbnailStorageKey,
        fileName: item.file.name,
        mimeType: item.file.type || "application/octet-stream",
        sizeBytes: item.file.size
      })
    });
    const complete = (await completeResponse.json()) as { error?: string; attachment?: Omit<ChatAttachmentView, "id"> };

    if (!completeResponse.ok || !complete.attachment) {
      throw new Error(complete.error ?? "Could not save attachment.");
    }

    updateAttachment(item.id, { status: "done", progress: 100 });
    return {
      ...complete.attachment,
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
    }

    startTransition(async () => {
      try {
        const uploaded = [];

        for (const item of attachments) {
          uploaded.push(await uploadAttachment(item));
        }

        const response = await fetch("/api/chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId: selectedThread.id,
            body: bodyToSend,
            attachments: uploaded
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
                messages: current.messages.some((message) => message.id === optimisticId)
                  ? current.messages.map((message) =>
                      message.id === optimisticId
                        ? ({ ...savedMessage, deliveryState: savedMessage.deliveryState ?? "SENT" } as ChatMessageView)
                        : message
                    )
                  : [...current.messages, savedMessage as ChatMessageView]
              }
            : current
        );
        clearQueuedAttachments();
        await refreshThreads();
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

  const filteredThreads = threads.filter((thread) => {
    const matchesType = threadFilter === "ALL" || thread.type === threadFilter;
    const matchesQuery = thread.title.toLowerCase().includes(threadQuery.toLowerCase());
    return matchesType && matchesQuery;
  });

  function directThreadProfile(thread: ChatThreadView | ChatThreadDetailView) {
    if (thread.type !== ChatThreadType.DIRECT) return null;
    return thread.participants.find((participant) => participant.id !== currentUserId) ?? null;
  }

  return (
    <div className={selectedThread ? "chat-layout has-selected-thread" : "chat-layout"}>
      <aside className="chat-sidebar surface rounded-md">
        <section className="chat-panel-section">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Chats</p>
          <h2 className="mt-2 text-2xl font-semibold">Messages</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Fast direct and group chat. Formal mail is separate.</p>
          <input
            className="form-field mt-4"
            onChange={(event) => setThreadQuery(event.target.value)}
            placeholder="Search chats..."
            value={threadQuery}
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
        </section>

        <section className="chat-thread-list">
          {filteredThreads.length === 0 ? (
            <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-sm text-[var(--muted)]">No chats yet.</p>
          ) : null}
          {filteredThreads.map((thread) => {
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
                  <Link
                    aria-label={`View ${profile.displayName}'s profile`}
                    className="chat-avatar"
                    href={`/profile/${profile.username}`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {initials(profile.displayName)}
                  </Link>
                ) : (
                  <span className="chat-avatar">{initials(thread.title)}</span>
                )}
                <span className="min-w-0 flex-1 text-left">
                  {profile ? (
                    <ProfileNameLink person={profile}>
                      <span className="block truncate font-semibold">{thread.title}</span>
                    </ProfileNameLink>
                  ) : (
                    <span className="block truncate font-semibold">{thread.title}</span>
                  )}
                  <span className="block truncate text-sm text-[var(--muted)]">{shortMessagePreview(thread.lastMessage)}</span>
                </span>
                {thread.unread ? <span className="h-2 w-2 rounded-full bg-[var(--gold)]" /> : null}
              </div>
            );
          })}
        </section>

        <section className="chat-panel-section border-t border-[var(--line)]">
          <p className="text-sm font-semibold text-[var(--gold)]">Start a direct chat</p>
          <input
            className="form-field mt-3"
            onChange={(event) => setContactQuery(event.target.value)}
            placeholder="Search by name, username, email, or location..."
            value={contactQuery}
          />
          <div className="mt-3 grid gap-2">
            {contacts.map((person) => (
              <div
                className="chat-person-card"
                key={person.id}
                onClick={() => startDirectChat(person)}
                onKeyDown={(event) => activateKeyboard(event, () => startDirectChat(person))}
                role="button"
                tabIndex={0}
              >
                <Link
                  aria-label={`View ${person.displayName}'s profile`}
                  className="chat-avatar"
                  href={`/profile/${person.username}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  {initials(person.displayName)}
                </Link>
                <span className="min-w-0 text-left">
                  <ProfileNameLink person={person}>
                    <span className="block truncate font-semibold">{person.displayName}</span>
                  </ProfileNameLink>
                  <ProfileNameLink person={person}>
                    <span className="block truncate text-sm text-[var(--muted)]">@{person.username}</span>
                  </ProfileNameLink>
                </span>
              </div>
            ))}
          </div>
        </section>
      </aside>

      <section className="chat-window surface rounded-md">
        {selectedThread ? (
          <>
            <header className="chat-window-header">
              <button className="chat-window-back" onClick={() => setSelectedThread(null)} type="button">
                Chats
              </button>
              <div>
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
              </div>
            </header>

            <div className="chat-message-list" ref={messageListRef}>
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
              Pick an existing conversation or search for a member on the left. This is chat only; Mail gets its own client next.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
