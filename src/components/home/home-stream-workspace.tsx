"use client";

import { ChatThreadType } from "@prisma/client";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { FeedClient } from "@/components/feed/feed-client";
import type { AdPlacementCardView } from "@/modules/ads-credits/types";
import type { ChatMessageView, ChatPersonView, ChatThreadDetailView, ChatThreadView } from "@/modules/chat-messages/types";
import type { FeedPostView } from "@/modules/feed-stream/types";

type CurrentAuthor = {
  id?: string;
  avatarUrl?: string | null;
  displayName: string;
  username: string;
};

type LatestAlert = {
  title: string;
  body: string | null;
  href: string | null;
};

type HomeStreamWorkspaceProps = {
  bannerUrl?: string | null;
  currentAuthor: CurrentAuthor;
  initialChatThreads: ChatThreadView[];
  initialPosts: FeedPostView[];
  initialReservedStreamAds: AdPlacementCardView[];
  isAdmin?: boolean;
  latestAlert?: LatestAlert | null;
};

function initials(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function messagePreview(message?: ChatMessageView | null) {
  if (!message) return "No messages yet.";
  if (message.body?.trim()) return message.body;
  return `${message.attachments.length} attachment${message.attachments.length === 1 ? "" : "s"}`;
}

function isImageAttachment(message: ChatMessageView) {
  return message.attachments.some((attachment) => attachment.kind === "IMAGE" && (attachment.thumbnailUrl || attachment.publicUrl));
}

function CompactMessage({
  currentUserId,
  isAdmin,
  message
}: {
  currentUserId: string;
  isAdmin?: boolean;
  message: ChatMessageView;
}) {
  const isMine = message.sender.id === currentUserId;
  const imageAttachment = message.attachments.find((attachment) => attachment.kind === "IMAGE" && (attachment.thumbnailUrl || attachment.publicUrl));

  return (
    <article className={isMine ? "home-comm-message is-mine" : "home-comm-message"}>
      {!isMine ? <span className="home-comm-message-author">{message.sender.displayName}</span> : null}
      {imageAttachment ? (
        <a className="home-comm-image-link" href={imageAttachment.publicUrl ?? imageAttachment.thumbnailUrl ?? "#"} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={imageAttachment.fileName} loading="lazy" src={imageAttachment.thumbnailUrl ?? imageAttachment.publicUrl ?? ""} />
        </a>
      ) : null}
      {message.body?.trim() ? <p>{message.body}</p> : isImageAttachment(message) ? null : <p>{messagePreview(message)}</p>}
      {isAdmin && !message.id.startsWith("local-") ? <code className="admin-object-id">Chat message ID: {message.id}</code> : null}
    </article>
  );
}

function HomeCommDock({
  currentUserId,
  initialThreads,
  isAdmin,
  onClose,
  open
}: {
  currentUserId: string;
  initialThreads: ChatThreadView[];
  isAdmin?: boolean;
  onClose: () => void;
  open: boolean;
}) {
  const messageListRef = useRef<HTMLDivElement>(null);
  const [threads, setThreads] = useState(initialThreads);
  const [selectedThread, setSelectedThread] = useState<ChatThreadDetailView | null>(null);
  const [threadQuery, setThreadQuery] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [contacts, setContacts] = useState<ChatPersonView[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const filteredThreads = useMemo(() => {
    const query = threadQuery.trim().toLowerCase();
    if (!query) return threads;
    return threads.filter((thread) => {
      return (
        thread.title.toLowerCase().includes(query) ||
        thread.participants.some((participant) => participant.displayName.toLowerCase().includes(query) || participant.username.toLowerCase().includes(query))
      );
    });
  }, [threadQuery, threads]);

  const refreshThreads = useCallback(async () => {
    const response = await fetch("/api/chat/threads", { cache: "no-store" });
    if (response.ok) {
      const payload = (await response.json()) as { threads: ChatThreadView[] };
      setThreads(payload.threads ?? []);
    }
  }, []);

  const loadThread = useCallback(
    async (threadId: string, options?: { silent?: boolean }) => {
      if (!options?.silent) setError("");
      const response = await fetch(`/api/chat/threads/${threadId}`, { cache: "no-store" });
      const payload = (await response.json()) as { error?: string; thread?: ChatThreadDetailView };

      if (!response.ok || !payload.thread) {
        if (!options?.silent) setError(payload.error ?? "Could not open chat.");
        return;
      }

      setSelectedThread(payload.thread);
      await fetch(`/api/chat/threads/${threadId}/read`, { method: "POST" });
      await refreshThreads();
    },
    [refreshThreads]
  );

  useEffect(() => {
    if (!open) return;

    void refreshThreads();
    const interval = window.setInterval(() => {
      void refreshThreads();
    }, 8000);
    return () => window.clearInterval(interval);
  }, [open, refreshThreads]);

  useEffect(() => {
    if (!open || !selectedThread?.id) return;

    const interval = window.setInterval(() => {
      void loadThread(selectedThread.id, { silent: true });
    }, 4000);

    return () => window.clearInterval(interval);
  }, [loadThread, open, selectedThread?.id]);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [selectedThread?.id, selectedThread?.messages.length]);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(async () => {
      const response = await fetch(`/api/chat/contacts?q=${encodeURIComponent(contactQuery)}`, { cache: "no-store" });
      if (response.ok) {
        const payload = (await response.json()) as { people: ChatPersonView[] };
        setContacts(payload.people ?? []);
      }
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [contactQuery, open]);

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

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const bodyToSend = body.trim();
    if (!selectedThread || !bodyToSend) return;

    setError("");
    setBody("");
    startTransition(async () => {
      const response = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: selectedThread.id,
          body: bodyToSend,
          attachments: []
        })
      });
      const payload = (await response.json()) as { error?: string; message?: ChatMessageView };

      if (!response.ok || !payload.message) {
        setBody(bodyToSend);
        setError(payload.error ?? "Could not send message.");
        return;
      }

      setSelectedThread((current) =>
        current
          ? {
              ...current,
              messages: [...current.messages, payload.message as ChatMessageView]
            }
          : current
      );
      await refreshThreads();
    });
  }

  return (
    <aside aria-hidden={!open} className={open ? "home-comm-dock is-open" : "home-comm-dock"}>
      {open ? (
        <>
          <header className="home-comm-dock-header">
            <button
              className="home-comm-dock-back"
              data-tooltip="Return to your chat list."
              disabled={!selectedThread}
              onClick={() => setSelectedThread(null)}
              type="button"
            >
              Chats
            </button>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Comm</p>
              <h2>{selectedThread?.title ?? "Messages"}</h2>
              {selectedThread ? <span>{selectedThread.participants.length} participants</span> : <span>Chat while browsing the stream.</span>}
              {isAdmin && selectedThread ? <code className="admin-object-id">Chat thread ID: {selectedThread.id}</code> : null}
            </div>
            <button className="home-comm-close" data-tooltip="Close Comm and return the stream to center." onClick={onClose} type="button">
              Close
            </button>
          </header>

          {selectedThread ? (
            <>
              <div className="home-comm-message-list" ref={messageListRef}>
                {selectedThread.messages.length === 0 ? (
                  <p className="home-comm-empty">No messages yet. Send the first note.</p>
                ) : null}
                {selectedThread.messages.map((message) => (
                  <CompactMessage currentUserId={currentUserId} isAdmin={isAdmin} key={message.id} message={message} />
                ))}
              </div>
              <form className="home-comm-compose" onSubmit={sendMessage}>
                <textarea
                  className="form-field home-comm-input"
                  onChange={(event) => setBody(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Message..."
                  value={body}
                />
                <button
                  className="btn-primary send-logo-button is-compact home-comm-send"
                  data-tooltip="Send this message."
                  disabled={isPending || !body.trim()}
                  type="submit"
                >
                  <span aria-hidden="true" className="send-logo-icon" />
                  <span className="sr-only">Send</span>
                </button>
              </form>
            </>
          ) : (
            <div className="home-comm-list-panel">
              <input
                className="form-field"
                onChange={(event) => setThreadQuery(event.target.value)}
                placeholder="Search messages..."
                value={threadQuery}
              />
              <div className="home-comm-filter-row" aria-label="Chat filters">
                <span className="is-active">All</span>
                <span>Direct</span>
                <span>Groups</span>
              </div>
              <div className="home-comm-thread-list">
                {filteredThreads.length === 0 ? <p className="home-comm-empty">No chats found.</p> : null}
                {filteredThreads.map((thread) => (
                  <button className="home-comm-thread" key={thread.id} onClick={() => loadThread(thread.id)} type="button">
                    <span className="chat-avatar">{initials(thread.title)}</span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="home-comm-thread-title">
                        {thread.title}
                        {thread.type === ChatThreadType.GROUP ? <small>Group</small> : null}
                      </span>
                      <span className="home-comm-thread-preview">{messagePreview(thread.lastMessage)}</span>
                    </span>
                    {thread.unread ? <span className="home-comm-unread" /> : null}
                  </button>
                ))}
              </div>
              <div className="home-comm-contact-search">
                <p className="text-sm font-semibold text-[var(--gold)]">Start chat</p>
                <input
                  className="form-field"
                  onChange={(event) => setContactQuery(event.target.value)}
                  placeholder="Find a member..."
                  value={contactQuery}
                />
                <div className="home-comm-contact-list">
                  {contacts.map((person) => (
                    <button className="home-comm-thread" key={person.id} onClick={() => startDirectChat(person)} type="button">
                      <span className="chat-avatar">{initials(person.displayName)}</span>
                      <span className="min-w-0 flex-1 text-left">
                        <span className="home-comm-thread-title">{person.displayName}</span>
                        <span className="home-comm-thread-preview">@{person.username}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {error ? <p className="home-comm-error">{error}</p> : null}
        </>
      ) : null}
    </aside>
  );
}

export function HomeStreamWorkspace({
  bannerUrl,
  currentAuthor,
  initialChatThreads,
  initialPosts,
  initialReservedStreamAds,
  isAdmin = false,
  latestAlert
}: HomeStreamWorkspaceProps) {
  const [commOpen, setCommOpen] = useState(false);

  useEffect(() => {
    function openCommDock() {
      setCommOpen(true);
    }

    window.addEventListener("theta:open-comm-dock", openCommDock);
    return () => window.removeEventListener("theta:open-comm-dock", openCommDock);
  }, []);

  function openComposer() {
    window.dispatchEvent(new CustomEvent("theta:open-feed-composer"));
  }

  return (
    <div className={commOpen ? "home-comm-workspace is-comm-open" : "home-comm-workspace"}>
      <div className="home-comm-main">
        <section
          className="home-front-strip surface rounded-md"
          style={bannerUrl ? { backgroundImage: `linear-gradient(90deg, rgba(8, 11, 16, 0.86), rgba(8, 11, 16, 0.42)), url(${bannerUrl})` } : undefined}
        >
          <button className="home-front-compose-trigger" data-tooltip="Open the stream composer." onClick={openComposer} type="button">
            <span className="home-front-avatar">
              {currentAuthor.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" src={currentAuthor.avatarUrl} />
              ) : (
                <span>{initials(currentAuthor.displayName)}</span>
              )}
            </span>
            <span className="home-front-compose-copy">
              <strong>Communicate</strong>
              <span>Post, photo, link, survey</span>
            </span>
          </button>
          {latestAlert ? (
            <a className="home-login-alert" href={latestAlert.href ?? "/alerts"}>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">System notice</span>
              <strong>{latestAlert.title}</strong>
              {latestAlert.body ? <span>{latestAlert.body}</span> : null}
            </a>
          ) : null}
        </section>
        <section className="mt-5">
          <FeedClient currentAuthor={currentAuthor} initialReservedStreamAds={initialReservedStreamAds} initialPosts={initialPosts} isAdmin={isAdmin} showComposerTrigger={false} />
        </section>
      </div>

      <HomeCommDock currentUserId={currentAuthor.id ?? ""} initialThreads={initialChatThreads} isAdmin={isAdmin} onClose={() => setCommOpen(false)} open={commOpen} />
    </div>
  );
}
