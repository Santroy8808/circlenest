"use client";

import { ChatThreadType } from "@prisma/client";
import { useEffect, useRef, useState, useTransition } from "react";
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

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
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

function AttachmentPreview({ attachment }: { attachment: ChatAttachmentView }) {
  if (attachment.kind === "IMAGE" && attachment.publicUrl) {
    return (
      <a className="chat-attachment-image" href={attachment.publicUrl} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={attachment.fileName} src={attachment.publicUrl} />
      </a>
    );
  }

  return (
    <a className="chat-attachment-file" href={attachment.publicUrl ?? "#"} target="_blank" rel="noreferrer">
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

  async function loadThread(threadId: string) {
    setError("");
    const response = await fetch(`/api/chat/threads/${threadId}`, { cache: "no-store" });
    const payload = (await response.json()) as { error?: string; thread?: ChatThreadDetailView };

    if (!response.ok || !payload.thread) {
      setError(payload.error ?? "Could not open chat.");
      return;
    }

    setSelectedThread(payload.thread);
    await fetch(`/api/chat/threads/${threadId}/read`, { method: "POST" });
    await refreshThreads();
  }

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
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      progress: 0,
      status: "queued" as const
    }));

    setAttachments((current) => [...current, ...next]);
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

    const completeResponse = await fetch("/api/chat/complete-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storageKey: intent.storageKey,
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
    return complete.attachment;
  }

  function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedThread) return;

    setError("");
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
            body,
            attachments: uploaded
          })
        });
        const payload = (await response.json()) as { error?: string; message?: ChatMessageView };

        if (!response.ok || !payload.message) {
          throw new Error(payload.error ?? "Could not send message.");
        }

        setSelectedThread((current) =>
          current ? { ...current, messages: [...current.messages, payload.message as ChatMessageView] } : current
        );
        setBody("");
        setAttachments([]);
        await refreshThreads();
      } catch (caught) {
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
          {filteredThreads.map((thread) => (
            <button
              className={selectedThread?.id === thread.id ? "chat-thread-card is-active" : "chat-thread-card"}
              key={thread.id}
              onClick={() => loadThread(thread.id)}
              type="button"
            >
              <span className="chat-avatar">{initials(thread.title)}</span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate font-semibold">{thread.title}</span>
                <span className="block truncate text-sm text-[var(--muted)]">{shortMessagePreview(thread.lastMessage)}</span>
              </span>
              {thread.unread ? <span className="h-2 w-2 rounded-full bg-[var(--gold)]" /> : null}
            </button>
          ))}
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
              <button className="chat-person-card" key={person.id} onClick={() => startDirectChat(person)} type="button">
                <span className="chat-avatar">{initials(person.displayName)}</span>
                <span className="min-w-0 text-left">
                  <span className="block truncate font-semibold">{person.displayName}</span>
                  <span className="block truncate text-sm text-[var(--muted)]">@{person.username}</span>
                </span>
              </button>
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
                <h2 className="mt-1 text-2xl font-semibold">{selectedThread.title}</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">{selectedThread.participants.length} participants</p>
              </div>
            </header>

            <div className="chat-message-list">
              {selectedThread.messages.length === 0 ? (
                <div className="chat-empty-state">
                  <h3 className="text-xl font-semibold text-[var(--gold)]">No messages yet</h3>
                  <p className="mt-2 text-[var(--muted)]">Send the first note or drop in a file.</p>
                </div>
              ) : null}
              {selectedThread.messages.map((message) => {
                const isMine = message.sender.id === currentUserId;
                return (
                  <article className={isMine ? "chat-message is-mine" : "chat-message"} key={message.id}>
                    <div className="chat-message-meta">
                      <span>{isMine ? "You" : message.sender.displayName}</span>
                      <span>{new Date(message.createdAt).toLocaleString()}</span>
                    </div>
                    {message.body ? <p className="whitespace-pre-wrap">{message.body}</p> : null}
                    {message.attachments.length > 0 ? (
                      <div className="mt-3 grid gap-2">
                        {message.attachments.map((attachment) => (
                          <AttachmentPreview attachment={attachment} key={attachment.id} />
                        ))}
                      </div>
                    ) : null}
                  </article>
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
                <button className="btn-secondary px-3 py-2 text-sm" onClick={() => fileInputRef.current?.click()} type="button">
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
              <textarea
                className="form-field mt-3 min-h-24 resize-y"
                onChange={(event) => setBody(event.target.value)}
                onKeyDown={sendOnEnter}
                placeholder="Type a message, or drag files here..."
                value={body}
              />
              {attachments.length > 0 ? (
                <div className="mt-3 grid gap-2">
                  {attachments.map((item) => (
                    <div className="chat-upload-chip" key={item.id}>
                      {item.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt="" src={item.previewUrl} />
                      ) : (
                        <span className="chat-file-icon">File</span>
                      )}
                      <span className="min-w-0 flex-1 truncate">{item.file.name}</span>
                      <span className="text-xs text-[var(--muted)]">{item.progress}%</span>
                      <button
                        className="btn-secondary px-3 py-1 text-xs"
                        onClick={() => setAttachments((current) => current.filter((candidate) => candidate.id !== item.id))}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {error ? <p className="mt-3 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
              <div className="mt-4 flex justify-end">
                <button className="btn-primary send-logo-button" disabled={isPending || (!body.trim() && attachments.length === 0)} type="submit">
                  <span aria-hidden="true" className="send-logo-icon" />
                  <span className="sr-only">{isPending ? "Sending..." : "Send"}</span>
                </button>
              </div>
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
