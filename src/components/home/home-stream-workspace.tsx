"use client";

import { ChatThreadType } from "@prisma/client";
import Link from "next/link";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { FeedClient } from "@/components/feed/feed-client";
import {
  contactsWithoutExistingDirectChats,
  filterHomeCommThreads,
  homeCommContactScope
} from "@/components/home/home-comm-search";
import { InAppImageViewer } from "@/components/media/in-app-image-viewer";
import type { AdPlacementCardView } from "@/modules/ads-credits/types";
import type { ChatMessageView, ChatPersonView, ChatThreadDetailView, ChatThreadView } from "@/modules/chat-messages/types";
import type { FeedCursor } from "@/modules/feed-stream/feed-pagination";
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
  canRequestSupport?: boolean;
  currentAuthor: CurrentAuthor;
  initialChatThreads: ChatThreadView[];
  initialFeedHasMore: boolean;
  initialFeedNextCursor: FeedCursor | null;
  initialPosts: FeedPostView[];
  initialReservedStreamAds: AdPlacementCardView[];
  isAdmin?: boolean;
  latestAlert?: LatestAlert | null;
  showStreamFilters?: boolean;
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

function activateKeyboard(event: KeyboardEvent<HTMLElement>, action: () => void) {
  if (event.target instanceof HTMLElement && event.target.closest("a, button, input, textarea, select")) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
}

function ProfilePersonLink({ children, person }: { children: ReactNode; person: ChatPersonView }) {
  return (
    <Link className="profile-inline-link" href={`/profile/${person.username}`} onClick={(event) => event.stopPropagation()}>
      {children}
    </Link>
  );
}

function ChatPersonAvatar({ person }: { person: ChatPersonView }) {
  return (
    <span className="chat-avatar">
      {person.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" src={person.avatarUrl} />
      ) : (
        initials(person.displayName)
      )}
    </span>
  );
}

function CompactMessage({
  currentUserId,
  isAdmin,
  isNotice = false,
  message
}: {
  currentUserId: string;
  isAdmin?: boolean;
  isNotice?: boolean;
  message: ChatMessageView;
}) {
  const isMine = message.sender.id === currentUserId;
  const imageAttachment = message.attachments.find((attachment) => attachment.kind === "IMAGE" && (attachment.thumbnailUrl || attachment.publicUrl));
  const messageClassName = ["home-comm-message", isMine ? "is-mine" : "", isNotice ? "is-notice" : ""].filter(Boolean).join(" ");

  return (
    <article className={messageClassName}>
      {!isMine ? (
        isNotice ? (
          <span className="home-comm-message-author">System notice</span>
        ) : (
          <ProfilePersonLink person={message.sender}>
            <span className="home-comm-message-author">{message.sender.displayName}</span>
          </ProfilePersonLink>
        )
      ) : null}
      {imageAttachment ? (
        <InAppImageViewer
          alt={imageAttachment.fileName}
          className="home-comm-image-link"
          src={imageAttachment.publicUrl ?? imageAttachment.thumbnailUrl ?? ""}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={imageAttachment.fileName} loading="lazy" src={imageAttachment.thumbnailUrl ?? imageAttachment.publicUrl ?? ""} />
        </InAppImageViewer>
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
  const [searchQuery, setSearchQuery] = useState("");
  const [includeAllMembers, setIncludeAllMembers] = useState(false);
  const [contacts, setContacts] = useState<ChatPersonView[]>([]);
  const [isSearchingContacts, setIsSearchingContacts] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const selectedThreadIsNotice = Boolean(selectedThread?.title.match(/^announcement:/i));
  const selectedThreadTitle = selectedThread?.title.replace(/^announcement:\s*/i, "") ?? "Messages";

  const filteredThreads = useMemo(
    () => filterHomeCommThreads(threads, searchQuery),
    [searchQuery, threads]
  );
  const availableContacts = useMemo(
    () => contactsWithoutExistingDirectChats(contacts, threads, currentUserId),
    [contacts, currentUserId, threads]
  );

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
    if (!open || !searchQuery.trim()) {
      setContacts([]);
      setIsSearchingContacts(false);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setIsSearchingContacts(true);
      try {
        const params = new URLSearchParams({
          q: searchQuery,
          filter: homeCommContactScope(includeAllMembers)
        });
        const response = await fetch(`/api/chat/contacts?${params.toString()}`, { cache: "no-store" });
        const payload = (await response.json()) as { error?: string; people?: ChatPersonView[] };
        if (!response.ok) throw new Error(payload.error ?? "Could not search members.");
        if (!cancelled) setContacts(payload.people ?? []);
      } catch (caught) {
        if (!cancelled) {
          setContacts([]);
          setError(caught instanceof Error ? caught.message : "Could not search members.");
        }
      } finally {
        if (!cancelled) setIsSearchingContacts(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [includeAllMembers, open, searchQuery]);

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
      setSearchQuery("");
      await refreshThreads();
    });
  }

  function directThreadProfile(thread: ChatThreadView | ChatThreadDetailView) {
    if (thread.type !== ChatThreadType.DIRECT) return null;
    return thread.participants.find((participant) => participant.id !== currentUserId) ?? null;
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
          <header className={selectedThreadIsNotice ? "home-comm-dock-header is-announcement-chat" : "home-comm-dock-header"}>
            <button
              className="home-comm-dock-back"
              data-tooltip="Return to your chat list."
              disabled={!selectedThread}
              onClick={() => setSelectedThread(null)}
              type="button"
            >
              Chats
            </button>
            <div className="home-comm-title-block min-w-0">
              <p className="home-comm-kicker">{selectedThreadIsNotice ? "System Notice" : "Comm"}</p>
              <h2>
                {selectedThread && directThreadProfile(selectedThread) && !selectedThreadIsNotice ? (
                  <ProfilePersonLink person={directThreadProfile(selectedThread)!}>{selectedThreadTitle}</ProfilePersonLink>
                ) : (
                  selectedThreadTitle
                )}
              </h2>
              {selectedThread ? <span>{selectedThreadIsNotice ? "Pinned platform announcement" : `${selectedThread.participants.length} participants`}</span> : <span>Chat while browsing the stream.</span>}
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
                  <CompactMessage currentUserId={currentUserId} isAdmin={isAdmin} isNotice={selectedThreadIsNotice} key={message.id} message={message} />
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
              <div className="home-comm-search-controls">
                <input
                  className="form-field"
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search chats, messages, or people..."
                  value={searchQuery}
                />
                <label className="home-comm-member-scope">
                  <input
                    checked={includeAllMembers}
                    onChange={(event) => setIncludeAllMembers(event.target.checked)}
                    type="checkbox"
                  />
                  <span>Include all non-private members</span>
                </label>
              </div>
              <div className="home-comm-filter-row" aria-label="Chat filters">
                <span className="is-active">All</span>
                <span>Direct</span>
                <span>Groups</span>
              </div>
              <div className="home-comm-search-results">
                {filteredThreads.length > 0 ? (
                  <section className="home-comm-result-section">
                    {searchQuery.trim() ? <p className="home-comm-result-heading">Chats and messages</p> : null}
                    <div className="home-comm-thread-list">
                      {filteredThreads.map((thread) => {
                        const profile = directThreadProfile(thread);
                        return (
                          <div
                            className="home-comm-thread"
                            key={thread.id}
                            onClick={() => loadThread(thread.id)}
                            onKeyDown={(event) => activateKeyboard(event, () => loadThread(thread.id))}
                            role="button"
                            tabIndex={0}
                          >
                            {profile ? (
                              <ProfilePersonLink person={profile}>
                                <ChatPersonAvatar person={profile} />
                              </ProfilePersonLink>
                            ) : (
                              <span className="chat-avatar">{initials(thread.title)}</span>
                            )}
                            <span className="min-w-0 flex-1 text-left">
                              <span className="home-comm-thread-title">
                                {profile ? (
                                  <ProfilePersonLink person={profile}>{thread.title}</ProfilePersonLink>
                                ) : (
                                  thread.title
                                )}
                                {thread.type === ChatThreadType.GROUP ? <small>Group</small> : null}
                              </span>
                              <span className="home-comm-thread-preview">{messagePreview(thread.lastMessage)}</span>
                            </span>
                            {thread.unread ? <span className="home-comm-unread" /> : null}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ) : null}
                {searchQuery.trim() && availableContacts.length > 0 ? (
                  <section className="home-comm-result-section">
                    <p className="home-comm-result-heading">People</p>
                    <div className="home-comm-contact-list">
                      {availableContacts.map((person) => (
                        <div
                          className="home-comm-thread"
                          key={person.id}
                          onClick={() => startDirectChat(person)}
                          onKeyDown={(event) => activateKeyboard(event, () => startDirectChat(person))}
                          role="button"
                          tabIndex={0}
                        >
                          <ProfilePersonLink person={person}>
                            <ChatPersonAvatar person={person} />
                          </ProfilePersonLink>
                          <span className="min-w-0 flex-1 text-left">
                            <span className="home-comm-thread-title">
                              <ProfilePersonLink person={person}>{person.displayName}</ProfilePersonLink>
                            </span>
                            <span className="home-comm-thread-preview">
                              <ProfilePersonLink person={person}>@{person.username}</ProfilePersonLink>
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
                {searchQuery.trim() && !isSearchingContacts && filteredThreads.length === 0 && availableContacts.length === 0 ? (
                  <p className="home-comm-empty">No chats or people found.</p>
                ) : null}
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
  canRequestSupport = false,
  currentAuthor,
  initialChatThreads,
  initialFeedHasMore,
  initialFeedNextCursor,
  initialPosts,
  initialReservedStreamAds,
  isAdmin = false,
  latestAlert,
  showStreamFilters = true
}: HomeStreamWorkspaceProps) {
  const [commOpen, setCommOpen] = useState(false);
  const [bannerFailed, setBannerFailed] = useState(false);
  const [showBannerAlert, setShowBannerAlert] = useState(Boolean(latestAlert));
  const showBannerImage = Boolean(bannerUrl && !bannerFailed);
  const showAnnouncement = Boolean(latestAlert && showBannerAlert);

  useEffect(() => {
    setBannerFailed(false);
  }, [bannerUrl]);

  useEffect(() => {
    setShowBannerAlert(Boolean(latestAlert));
  }, [latestAlert]);

  useEffect(() => {
    if (!latestAlert || !showBannerAlert) return;

    const timeoutId = window.setTimeout(() => {
      setShowBannerAlert(false);
    }, 30000);

    return () => window.clearTimeout(timeoutId);
  }, [latestAlert, showBannerAlert]);

  useEffect(() => {
    function openCommDock() {
      setCommOpen(true);
    }

    function toggleCommDock() {
      setCommOpen((current) => !current);
    }

    window.addEventListener("theta:open-comm-dock", openCommDock);
    window.addEventListener("theta:toggle-comm-dock", toggleCommDock);
    return () => {
      window.removeEventListener("theta:open-comm-dock", openCommDock);
      window.removeEventListener("theta:toggle-comm-dock", toggleCommDock);
    };
  }, []);

  function openComposer() {
    window.dispatchEvent(new CustomEvent("theta:open-feed-composer"));
  }

  return (
    <div className={commOpen ? "home-comm-workspace is-comm-open" : "home-comm-workspace"}>
      <div className="home-comm-main">
        {showAnnouncement && latestAlert ? (
          <a className="home-login-alert" href={latestAlert.href ?? "/alerts"}>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">System notice</span>
            <strong>{latestAlert.title}</strong>
            {latestAlert.body ? <span>{latestAlert.body}</span> : null}
          </a>
        ) : showBannerImage ? (
          <section className="home-front-strip surface rounded-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" className="home-front-strip-image" onError={() => setBannerFailed(true)} src={bannerUrl ?? ""} />
            <span className="home-front-strip-scrim" aria-hidden="true" />
          </section>
        ) : null}
        <div className="home-front-compose-row">
          <button className="home-front-compose-trigger" data-tooltip="Create a stream post." data-tutorial-target="stream-composer" onClick={openComposer} type="button">
            <span className="home-front-avatar">
              {currentAuthor.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" src={currentAuthor.avatarUrl} />
              ) : (
                <span>{initials(currentAuthor.displayName)}</span>
              )}
            </span>
            <span className="home-front-compose-copy">
              <strong>Communicate! Click here</strong>
              <span>Create a post, photo, link, or update.</span>
            </span>
          </button>
        </div>
        <section className="mt-5">
          <FeedClient
            canRequestSupport={canRequestSupport}
            currentAuthor={currentAuthor}
            initialHasMore={initialFeedHasMore}
            initialNextCursor={initialFeedNextCursor}
            initialReservedStreamAds={initialReservedStreamAds}
            initialPosts={initialPosts}
            isAdmin={isAdmin}
            showComposerTrigger={false}
            showModeFilters={showStreamFilters}
          />
        </section>
      </div>

      <HomeCommDock currentUserId={currentAuthor.id ?? ""} initialThreads={initialChatThreads} isAdmin={isAdmin} onClose={() => setCommOpen(false)} open={commOpen} />
    </div>
  );
}
