"use client";

import { MailAttachmentKind, MailDeliveryKind } from "@prisma/client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { AdminObjectId } from "@/components/admin/admin-object-id";
import { InAppImageViewer } from "@/components/media/in-app-image-viewer";
import { deletePasswordHeaders, promptForDeletePassword } from "@/lib/client/delete-password";
import {
  MAX_MAIL_ATTACHMENT_BYTES,
  MAX_MAIL_ATTACHMENTS,
  MAX_MAIL_TOTAL_ATTACHMENT_BYTES,
  type MailAttachmentView,
  type MailFolder,
  type MailMessageView,
  type MailPersonView,
  type MailPreferenceView,
  type MailThreadDetailView,
  type MailThreadSummaryView
} from "@/modules/mail/types";

const MAIL_MESSAGE_PAGE_SIZE = 30;

function putPrivateUpload(
  uploadUrl: string,
  uploadHeaders: Record<string, string>,
  file: File,
  onProgress: (progress: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", uploadUrl);
    Object.entries(uploadHeaders).forEach(([name, value]) => request.setRequestHeader(name, value));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    request.onerror = () => reject(new Error("The attachment upload was interrupted. Try again."));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error("The attachment could not be uploaded. Try again."));
    };
    request.send(file);
  });
}

type QueuedMailAttachment = {
  id: string;
  file: File;
  previewUrl?: string;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};

type UploadedMailAttachment = {
  mediaAssetId: string;
  kind: MailAttachmentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  publicUrl?: string | null;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function activateKeyboard(event: KeyboardEvent<HTMLElement>, action: () => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
}

function MailProfileLink({ person, children }: { person: MailPersonView; children: ReactNode }) {
  return (
    <Link className="profile-inline-link" href={`/profile/${person.username}`} onClick={(event) => event.stopPropagation()}>
      {children}
    </Link>
  );
}

function MailAttachmentPreview({ attachment }: { attachment: MailAttachmentView }) {
  if (attachment.kind === "IMAGE" && attachment.publicUrl) {
    return (
      <InAppImageViewer alt={attachment.fileName} className="mail-attachment-image" src={attachment.publicUrl}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={attachment.fileName} src={attachment.publicUrl} />
      </InAppImageViewer>
    );
  }

  return (
    <a className="mail-attachment-file" href={attachment.publicUrl ?? "#"} rel="noreferrer" target="_blank">
      <span>{attachment.fileName}</span>
      <span className="text-xs text-[var(--muted)]">{Number(attachment.sizeBytes).toLocaleString()} bytes</span>
    </a>
  );
}

function mailDeliveryListLabel(deliveryKind: MailDeliveryKind) {
  if (deliveryKind === MailDeliveryKind.INQUIRY) return "Inquiry";
  if (deliveryKind === MailDeliveryKind.MASS_INTERNAL) return "Mass internal";
  return "Direct";
}

function mailDeliveryReaderLabel(deliveryKind: MailDeliveryKind) {
  if (deliveryKind === MailDeliveryKind.INQUIRY) return "Storefront inquiry";
  if (deliveryKind === MailDeliveryKind.MASS_INTERNAL) return "Internal mass mail";
  return "Internal mail";
}

export function MailClient({
  currentUserId,
  initialFolder,
  initialNextCursor,
  initialPreference,
  initialSelectedThread,
  initialThreads,
  isAdmin = false
}: {
  currentUserId: string;
  initialFolder: MailFolder;
  initialNextCursor?: string | null;
  initialPreference: MailPreferenceView;
  initialSelectedThread?: MailThreadDetailView | null;
  initialThreads: MailThreadSummaryView[];
  isAdmin?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef<QueuedMailAttachment[]>([]);
  const [folder, setFolder] = useState<MailFolder>(initialFolder);
  const [threads, setThreads] = useState(initialThreads);
  const [nextFolderCursor, setNextFolderCursor] = useState(initialNextCursor ?? null);
  const [selectedThread, setSelectedThread] = useState<MailThreadDetailView | null>(initialSelectedThread ?? null);
  const [isLoadingFolder, setIsLoadingFolder] = useState(false);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isSearchingContacts, setIsSearchingContacts] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [replyThreadId, setReplyThreadId] = useState<string | null>(null);
  const [contactQuery, setContactQuery] = useState("");
  const [contacts, setContacts] = useState<MailPersonView[]>([]);
  const [recipients, setRecipients] = useState<MailPersonView[]>([]);
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [attachments, setAttachments] = useState<QueuedMailAttachment[]>([]);
  const [allowMassMail, setAllowMassMail] = useState(initialPreference.allowMassMail);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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

  function openCompose() {
    setReplyThreadId(null);
    setIsComposing(true);
    setSelectedThread(null);
  }

  function startReply() {
    if (!selectedThread) return;
    const candidates = [selectedThread.sender, ...selectedThread.recipients.map((recipient) => recipient.user)];
    const byId = new Map(
      candidates.filter((person) => person.id !== currentUserId).map((person) => [person.id, person])
    );
    setRecipients(Array.from(byId.values()));
    setSubject(selectedThread.subject);
    setBodyText("");
    setReplyThreadId(selectedThread.id);
    setIsComposing(true);
    setError("");
  }

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      if (contactQuery.trim().length < 2) {
        setContacts([]);
        setIsSearchingContacts(false);
        return;
      }

      setIsSearchingContacts(true);
      try {
        const response = await fetch(`/api/mail/contacts?q=${encodeURIComponent(contactQuery)}`, { cache: "no-store" });
        const payload = (await response.json()) as { error?: string; people?: MailPersonView[] };
        if (!response.ok) throw new Error(payload.error ?? "Could not search contacts.");
        setContacts(payload.people ?? []);
      } catch (caught) {
        setContacts([]);
        setError(caught instanceof Error ? caught.message : "Could not search contacts.");
      } finally {
        setIsSearchingContacts(false);
      }
    }, 200);

    return () => window.clearTimeout(timeout);
  }, [contactQuery]);

  async function refreshFolder(nextFolder = folder) {
    setIsLoadingFolder(true);
    try {
      const response = await fetch(`/api/mail/threads?folder=${nextFolder}`, { cache: "no-store" });
      const payload = (await response.json()) as {
        error?: string;
        threads?: MailThreadSummaryView[];
        nextCursor?: string | null;
      };
      if (!response.ok) throw new Error(payload.error ?? "Could not load this mail folder.");
      setThreads(payload.threads ?? []);
      setNextFolderCursor(payload.nextCursor ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load this mail folder.");
    } finally {
      setIsLoadingFolder(false);
    }
  }

  async function loadMoreThreads() {
    if (!nextFolderCursor || isLoadingFolder) return;
    setIsLoadingFolder(true);
    setError("");
    try {
      const params = new URLSearchParams({ folder, cursor: nextFolderCursor });
      const response = await fetch(`/api/mail/threads?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as {
        error?: string;
        threads?: MailThreadSummaryView[];
        nextCursor?: string | null;
      };
      if (!response.ok) throw new Error(payload.error ?? "Could not load more mail.");
      setThreads((current) => {
        const byId = new Map(current.map((thread) => [thread.id, thread]));
        (payload.threads ?? []).forEach((thread) => byId.set(thread.id, thread));
        return Array.from(byId.values());
      });
      setNextFolderCursor(payload.nextCursor ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load more mail.");
    } finally {
      setIsLoadingFolder(false);
    }
  }

  function chooseFolder(nextFolder: MailFolder) {
    setError("");
    setFolder(nextFolder);
    setThreads([]);
    setNextFolderCursor(null);
    setSelectedThread(null);
    setIsComposing(false);
    startTransition(() => {
      void refreshFolder(nextFolder);
    });
  }

  async function loadThread(threadId: string) {
    setError("");
    setIsLoadingThread(true);
    try {
      const response = await fetch(`/api/mail/threads/${threadId}?limit=${MAIL_MESSAGE_PAGE_SIZE}`, { cache: "no-store" });
      const payload = (await response.json()) as { error?: string; thread?: MailThreadDetailView };

      if (!response.ok || !payload.thread) {
        setError(payload.error ?? "Could not open mail.");
        return;
      }

      setSelectedThread(payload.thread);
      setIsComposing(false);
      await fetch(`/api/mail/threads/${threadId}/read`, { method: "POST" });
      await refreshFolder();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open mail.");
    } finally {
      setIsLoadingThread(false);
    }
  }

  async function loadOlderMessages() {
    if (!selectedThread?.nextCursor || isLoadingOlder) return;
    setIsLoadingOlder(true);
    setError("");
    try {
      const params = new URLSearchParams({ cursor: selectedThread.nextCursor, limit: String(MAIL_MESSAGE_PAGE_SIZE) });
      const response = await fetch(`/api/mail/threads/${selectedThread.id}?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as { error?: string; thread?: MailThreadDetailView };
      if (!response.ok || !payload.thread) throw new Error(payload.error ?? "Could not load earlier mail.");
      setSelectedThread((current) => {
        if (!current || current.id !== payload.thread!.id) return current;
        const byId = new Map<string, MailMessageView>();
        [...payload.thread!.messages, ...current.messages].forEach((message) => byId.set(message.id, message));
        return { ...payload.thread!, messages: Array.from(byId.values()), nextCursor: payload.thread!.nextCursor ?? null };
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load earlier mail.");
    } finally {
      setIsLoadingOlder(false);
    }
  }

  useEffect(() => {
    if (!selectedThread?.id || isComposing) return;
    const threadId = selectedThread.id;
    const interval = window.setInterval(() => {
      void (async () => {
        const response = await fetch(`/api/mail/threads/${threadId}?limit=${MAIL_MESSAGE_PAGE_SIZE}`, { cache: "no-store" });
        const payload = (await response.json()) as { thread?: MailThreadDetailView };
        if (!response.ok || !payload.thread) return;
        setSelectedThread((current) => {
          if (!current || current.id !== payload.thread!.id) return current;
          const byId = new Map(current.messages.map((message) => [message.id, message]));
          payload.thread!.messages.forEach((message) => byId.set(message.id, message));
          const messages = Array.from(byId.values()).sort(
            (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id)
          );
          return { ...payload.thread!, messages, nextCursor: current.nextCursor ?? payload.thread!.nextCursor ?? null };
        });
        await fetch(`/api/mail/threads/${threadId}/read`, { method: "POST" });
      })();
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [isComposing, selectedThread?.id]);

  function addRecipient(person: MailPersonView) {
    setRecipients((current) => (current.some((recipient) => recipient.id === person.id) ? current : [...current, person]));
    setContactQuery("");
    if (!isComposing) openCompose();
  }

  function addFiles(files: FileList | File[]) {
    const candidates = Array.from(files);
    if (attachments.length + candidates.length > MAX_MAIL_ATTACHMENTS) {
      setError(`Attach at most ${MAX_MAIL_ATTACHMENTS} files to one mail.`);
      return;
    }
    if (candidates.some((file) => file.size > MAX_MAIL_ATTACHMENT_BYTES)) {
      setError("Each attachment must be 20 MB or smaller.");
      return;
    }
    const totalBytes = [...attachments.map((attachment) => attachment.file), ...candidates].reduce(
      (total, file) => total + file.size,
      0
    );
    if (totalBytes > MAX_MAIL_TOTAL_ATTACHMENT_BYTES) {
      setError("Attachments for one mail may total no more than 40 MB.");
      return;
    }

    setError("");
    const next = candidates.map((file) => ({
      id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
      file,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      progress: 0,
      status: "queued" as const
    }));

    setAttachments((current) => [...current, ...next]);
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((attachment) => attachment.id !== id);
    });
  }

  function clearAttachments() {
    setAttachments((current) => {
      current.forEach((attachment) => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      });
      return [];
    });
  }

  function updateAttachment(id: string, patch: Partial<QueuedMailAttachment>) {
    setAttachments((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function uploadAttachment(item: QueuedMailAttachment) {
    updateAttachment(item.id, { status: "uploading", progress: 1, error: undefined });
    const intentResponse = await fetch("/api/mail/upload-intent", {
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

    await putPrivateUpload(intent.uploadUrl, intent.uploadHeaders, item.file, (progress) =>
      updateAttachment(item.id, { progress })
    );

    const completeResponse = await fetch("/api/mail/complete-upload", {
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
    const complete = (await completeResponse.json()) as { error?: string; attachment?: UploadedMailAttachment };

    if (!completeResponse.ok || !complete.attachment?.mediaAssetId) {
      throw new Error(complete.error ?? "Could not save attachment.");
    }

    updateAttachment(item.id, { status: "done", progress: 100 });
    return { ...complete.attachment, mediaAssetId: complete.attachment.mediaAssetId };
  }

  function applyFormat(format: "bold" | "italic" | "list" | "link") {
    if (format === "bold") setBodyText((current) => `${current}**bold text**`);
    if (format === "italic") setBodyText((current) => `${current}_italic text_`);
    if (format === "list") setBodyText((current) => `${current}\n- item`);
    if (format === "link") setBodyText((current) => `${current}[link text](https://)`);
  }

  function sendCurrentMail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    startTransition(async () => {
      try {
        const uploaded = [];

        for (const item of attachments) {
          uploaded.push(await uploadAttachment(item));
        }

        const response = await fetch("/api/mail/threads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipientUserIds: recipients.map((recipient) => recipient.id),
            threadId: replyThreadId ?? "",
            subject,
            bodyText,
            deliveryKind: recipients.length > 1 ? MailDeliveryKind.MASS_INTERNAL : MailDeliveryKind.DIRECT,
            attachments: uploaded
          })
        });
        const payload = (await response.json()) as { error?: string; thread?: MailThreadDetailView };

        if (!response.ok || !payload.thread) {
          throw new Error(payload.error ?? "Could not send mail.");
        }

        setNotice("Mail sent.");
        setSelectedThread(payload.thread);
        setIsComposing(false);
        setReplyThreadId(null);
        setRecipients([]);
        setSubject("");
        setBodyText("");
        clearAttachments();
        await refreshFolder(folder);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not send mail.");
      }
    });
  }

  function savePreference(nextAllowMassMail: boolean) {
    setAllowMassMail(nextAllowMassMail);
    startTransition(async () => {
      await fetch("/api/mail/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowMassMail: nextAllowMassMail })
      });
    });
  }

  async function updateSelectedThread(action: "archive" | "unarchive" | "delete") {
    if (!selectedThread) return;
    if (action === "delete" && !window.confirm("Delete this mail from your mailbox?")) return;
    const deletePassword = action === "delete" ? promptForDeletePassword() : null;
    if (action === "delete" && !deletePassword) {
      setError("Mail deletion cancelled. DELETE password was not entered.");
      return;
    }

    setError("");
    setNotice("");
    const response = await fetch(`/api/mail/threads/${selectedThread.id}`, {
      method: action === "delete" ? "DELETE" : "PATCH",
      ...(action === "delete"
        ? { headers: deletePasswordHeaders(deletePassword ?? "") }
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ archived: action === "archive" })
          })
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Could not update this mail.");
      return;
    }

    setNotice(action === "delete" ? "Mail deleted." : action === "archive" ? "Mail archived." : "Mail moved to inbox.");
    setSelectedThread(null);
    await refreshFolder();
  }

  return (
    <div className="mail-layout">
      <aside className="mail-sidebar surface rounded-md">
        <button
          className="btn-primary w-full"
          onClick={() => {
            openCompose();
          }}
          type="button"
        >
          Compose
        </button>
        <nav className="mt-4 grid gap-2">
          {(["inbox", "sent", "archive"] as MailFolder[]).map((item) => (
            <button
              className={folder === item ? "mail-folder is-active" : "mail-folder"}
              key={item}
              onClick={() => chooseFolder(item)}
              type="button"
            >
              {item === "inbox" ? "Inbox" : item === "sent" ? "Sent" : "Archive"}
            </button>
          ))}
        </nav>
        <section className="mt-6 border-t border-[var(--line)] pt-5">
          <p className="text-sm font-semibold text-[var(--gold)]">Contacts</p>
          <input
            className="form-field mt-3"
            onChange={(event) => setContactQuery(event.target.value)}
            placeholder="Search name, username, email..."
            value={contactQuery}
          />
          <div className="mt-3 grid gap-2">
            {isSearchingContacts ? (
              <p className="rounded-md border border-[var(--line)] p-3 text-sm text-[var(--muted)]" role="status">
                Searching contacts...
              </p>
            ) : null}
            {!isSearchingContacts && contactQuery.trim().length >= 2 && contacts.length === 0 ? (
              <p className="rounded-md border border-dashed border-[var(--line)] p-3 text-sm text-[var(--muted)]">
                No contacts match.
              </p>
            ) : null}
            {contacts.map((person) => (
              <div
                className="mail-contact-card"
                key={person.id}
                onClick={() => addRecipient(person)}
                onKeyDown={(event) => activateKeyboard(event, () => addRecipient(person))}
                role="button"
                tabIndex={0}
              >
                <Link
                  aria-label={`View ${person.displayName}'s profile`}
                  className="mail-avatar"
                  href={`/profile/${person.username}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  {initials(person.displayName)}
                </Link>
                <span className="min-w-0 text-left">
                  <MailProfileLink person={person}>
                    <span className="block truncate font-semibold">{person.displayName}</span>
                  </MailProfileLink>
                  <span className="block truncate text-xs text-[var(--muted)]">{person.email || `@${person.username}`}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
        <label className="mt-6 flex items-start gap-3 border-t border-[var(--line)] pt-5 text-sm text-[var(--muted)]">
          <input
            checked={allowMassMail}
            className="mt-1"
            onChange={(event) => savePreference(event.target.checked)}
            type="checkbox"
          />
          <span>Allow internal mass mail from members and businesses.</span>
        </label>
      </aside>

      <section className="mail-thread-list surface rounded-md">
        <header className="mail-list-header">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Mail</p>
          <h2 className="mt-2 text-2xl font-semibold">{folder === "inbox" ? "Inbox" : folder === "sent" ? "Sent" : "Archive"}</h2>
        </header>
        <div className="grid gap-2 p-3">
          {error && !isComposing ? (
            <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100" role="alert">
              {error}
            </p>
          ) : null}
          {isLoadingFolder && threads.length === 0 ? (
            <p className="rounded-md border border-[var(--line)] p-4 text-sm text-[var(--muted)]" role="status">
              Loading mail...
            </p>
          ) : null}
          {!isLoadingFolder && threads.length === 0 ? (
            <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-sm text-[var(--muted)]">No mail in this folder.</p>
          ) : null}
          {threads.map((thread) => (
            <div
              className={selectedThread?.id === thread.id ? "mail-thread-card is-active" : "mail-thread-card"}
              key={thread.id}
              onClick={() => loadThread(thread.id)}
              onKeyDown={(event) => activateKeyboard(event, () => loadThread(thread.id))}
              role="button"
              tabIndex={0}
            >
              <div className="mail-thread-card-heading flex items-start justify-between gap-3">
                <p className="mail-thread-subject truncate font-semibold">{thread.subject}</p>
                {thread.unread ? <span className="mt-2 h-2 w-2 rounded-full bg-[var(--gold)]" /> : null}
              </div>
              <p className="mail-thread-preview mt-1 truncate text-sm text-[var(--muted)]">
                <MailProfileLink person={thread.sender}>{thread.sender.displayName}</MailProfileLink>: {thread.preview}
              </p>
              <p className="mail-thread-meta mt-2 text-xs text-[var(--muted)]">
                {mailDeliveryListLabel(thread.deliveryKind)} ·{" "}
                {thread.lastMessageAt ? new Date(thread.lastMessageAt).toLocaleString() : "No date"}
              </p>
              <div className="mt-2">
                <AdminObjectId id={thread.id} kind="Mail thread" visible={isAdmin} />
              </div>
            </div>
          ))}
          {nextFolderCursor ? (
            <button
              className="btn-secondary min-h-11 w-full"
              disabled={isLoadingFolder}
              onClick={() => void loadMoreThreads()}
              type="button"
            >
              {isLoadingFolder ? "Loading more mail..." : "Load more mail"}
            </button>
          ) : null}
        </div>
      </section>

      <section className="mail-reader surface rounded-md">
        {isComposing ? (
          <form
            className="mail-compose"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              addFiles(event.dataTransfer.files);
            }}
            onSubmit={sendCurrentMail}
          >
            <header>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Compose mail</p>
              <h2 className="mt-2 text-2xl font-semibold">{replyThreadId ? "Reply to mail" : "New internal mail"}</h2>
            </header>
            <section className="grid gap-3">
              <div className="mail-recipient-box">
                <div className="flex flex-wrap gap-2">
                  {recipients.map((recipient) => (
                    <button
                      className="pill rounded-full px-3 py-1 text-sm"
                      key={recipient.id}
                      onClick={() => setRecipients((current) => current.filter((candidate) => candidate.id !== recipient.id))}
                      type="button"
                    >
                      {recipient.displayName} ×
                    </button>
                  ))}
                </div>
                <div className="relative mt-3">
                  <input
                    aria-label="Search mail recipients"
                    className="form-field"
                    onChange={(event) => setContactQuery(event.target.value)}
                    placeholder="To: search name, username, email..."
                    value={contactQuery}
                  />
                  {isSearchingContacts ? (
                    <div className="mail-recipient-search-results p-3 text-sm text-[var(--muted)]" role="status">
                      Searching contacts...
                    </div>
                  ) : contacts.length > 0 ? (
                    <div className="mail-recipient-search-results">
                      {contacts.map((person) => (
                        <div
                          className="mail-contact-card"
                          key={person.id}
                          onClick={() => addRecipient(person)}
                          onKeyDown={(event) => activateKeyboard(event, () => addRecipient(person))}
                          role="button"
                          tabIndex={0}
                        >
                          <Link
                            aria-label={`View ${person.displayName}'s profile`}
                            className="mail-avatar"
                            href={`/profile/${person.username}`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {initials(person.displayName)}
                          </Link>
                          <span className="min-w-0 text-left">
                            <MailProfileLink person={person}>
                              <span className="block truncate font-semibold">{person.displayName}</span>
                            </MailProfileLink>
                            <span className="block truncate text-xs text-[var(--muted)]">{person.email || `@${person.username}`}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <input className="form-field" onChange={(event) => setSubject(event.target.value)} placeholder="Subject" value={subject} />
              <div className="mail-format-row">
                <button className="btn-secondary px-3 py-2 text-sm" onClick={() => applyFormat("bold")} type="button">
                  B
                </button>
                <button className="btn-secondary px-3 py-2 text-sm" onClick={() => applyFormat("italic")} type="button">
                  I
                </button>
                <button className="btn-secondary px-3 py-2 text-sm" onClick={() => applyFormat("list")} type="button">
                  List
                </button>
                <button className="btn-secondary px-3 py-2 text-sm" onClick={() => applyFormat("link")} type="button">
                  Link
                </button>
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
                className="form-field min-h-64 resize-y"
                onChange={(event) => setBodyText(event.target.value)}
                placeholder="Write a formal internal mail..."
                value={bodyText}
              />
              {attachments.length > 0 ? (
                <div className="grid gap-2">
                  {attachments.map((item) => (
                    <div className="mail-upload-chip" key={item.id}>
                      {item.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt="" src={item.previewUrl} />
                      ) : (
                        <span className="mail-file-icon">File</span>
                      )}
                      <span className="min-w-0 flex-1 truncate">{item.file.name}</span>
                      <span className="text-xs text-[var(--muted)]">{item.progress}%</span>
                      <button
                        className="btn-secondary px-3 py-1 text-xs"
                        onClick={() => removeAttachment(item.id)}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
            {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
            <div className="mail-compose-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setIsComposing(false);
                  setReplyThreadId(null);
                }}
                type="button"
              >
                Cancel
              </button>
              <button className="btn-primary send-logo-button is-compact" disabled={isPending || recipients.length === 0 || !subject.trim() || !bodyText.trim()} type="submit">
                <span aria-hidden="true" className="send-logo-icon" />
                <span className="sr-only">{isPending ? "Sending..." : "Send mail"}</span>
              </button>
            </div>
          </form>
        ) : selectedThread ? (
          <article className="mail-thread-detail">
            <header className="mail-reader-header">
              <p className="text-sm uppercase tracking-[0.18em] text-[var(--gold)]">
                {mailDeliveryReaderLabel(selectedThread.deliveryKind)}
              </p>
              <h2 className="mt-2 text-3xl font-semibold">{selectedThread.subject}</h2>
              <div className="mt-2">
                <AdminObjectId id={selectedThread.id} kind="Mail thread" visible={isAdmin} />
              </div>
              <p className="mt-2 text-sm text-[var(--muted)]">
                To{" "}
                {selectedThread.recipients.map((recipient, index) => (
                  <span key={recipient.id}>
                    {index > 0 ? ", " : ""}
                    <MailProfileLink person={recipient.user}>{recipient.user.displayName}</MailProfileLink>
                  </span>
                ))}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn-primary min-h-11 px-4" onClick={startReply} type="button">
                  Reply
                </button>
                <button
                  className="btn-secondary min-h-11 px-4"
                  onClick={() => void updateSelectedThread(folder === "archive" ? "unarchive" : "archive")}
                  type="button"
                >
                  {folder === "archive" ? "Move to inbox" : "Archive"}
                </button>
                <button
                  className="btn-secondary min-h-11 px-4"
                  onClick={() => void updateSelectedThread("delete")}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </header>
            <div className="grid gap-4 p-5">
              {selectedThread.nextCursor ? (
                <button
                  className="btn-secondary min-h-11 justify-self-center px-4"
                  disabled={isLoadingOlder}
                  onClick={() => void loadOlderMessages()}
                  type="button"
                >
                  {isLoadingOlder ? "Loading earlier mail..." : "Load earlier mail"}
                </button>
              ) : null}
              {isLoadingThread ? (
                <p className="text-center text-sm text-[var(--muted)]" role="status">
                  Opening mail...
                </p>
              ) : null}
              {selectedThread.messages.map((message: MailMessageView) => (
                <section className="mail-message-card" key={message.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <Link className="mail-avatar" href={`/profile/${message.sender.username}`}>
                        {initials(message.sender.displayName)}
                      </Link>
                      <div className="min-w-0">
                        <MailProfileLink person={message.sender}>
                          <p className="font-semibold text-[var(--gold)]">{message.sender.displayName}</p>
                        </MailProfileLink>
                        <p className="truncate text-sm text-[var(--muted)]">{message.sender.email || `@${message.sender.username}`}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <AdminObjectId id={message.id} kind="Mail message" visible={isAdmin} />
                      <p className="text-xs text-[var(--muted)]">{new Date(message.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <p className="mt-5 whitespace-pre-wrap leading-7">{message.bodyText}</p>
                  {message.attachments.length > 0 ? (
                    <div className="mt-4 grid gap-2">
                      {message.attachments.map((attachment) => (
                        <MailAttachmentPreview attachment={attachment} key={attachment.id} />
                      ))}
                    </div>
                  ) : null}
                </section>
              ))}
            </div>
          </article>
        ) : (
          <div className="mail-empty-state">
            <h2 className="text-3xl font-semibold text-[var(--gold)]">Select a message</h2>
            <p className="mt-3 max-w-lg text-[var(--muted)]">
              Mail is for formal internal messages. Chat stays in Messages.
            </p>
            {notice ? <p className="mt-4 rounded-md border border-[var(--line)] p-3 text-sm text-[var(--gold)]">{notice}</p> : null}
          </div>
        )}
      </section>
    </div>
  );
}
