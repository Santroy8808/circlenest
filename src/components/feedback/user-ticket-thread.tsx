"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FeedbackTicketDetailView } from "@/modules/feedback-support/feedback-support.service";

type CreatorTicketView = Extract<FeedbackTicketDetailView, { audience: "creator" }>;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function UserTicketThread({ initialView }: { initialView: CreatorTicketView }) {
  const [view, setView] = useState(initialView);
  const [body, setBody] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [error, setError] = useState("");
  const requestId = useRef("");

  async function refresh(quiet = false) {
    try {
      const response = await fetch(
        `/api/feedback/tickets/${encodeURIComponent(view.ticket.publicId)}`,
        { cache: "no-store" }
      );
      const payload = (await response.json().catch(() => ({}))) as CreatorTicketView & { error?: string };
      if (!response.ok || payload.audience !== "creator") {
        throw new Error(payload.error ?? "Could not refresh this ticket.");
      }
      setView(payload);
      if (!quiet) setError("");
    } catch (refreshError) {
      if (!quiet) setError(refreshError instanceof Error ? refreshError.message : "Could not refresh this ticket.");
    }
  }

  useEffect(() => {
    const interval = window.setInterval(() => void refresh(true), 30_000);
    return () => window.clearInterval(interval);
  }, [view.ticket.publicId]);

  async function sendReply() {
    if (!body.trim() || state === "sending") return;
    if (!requestId.current) requestId.current = crypto.randomUUID();
    setState("sending");
    setError("");
    try {
      const response = await fetch(
        `/api/feedback/tickets/${encodeURIComponent(view.ticket.publicId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "NORMAL",
            body,
            idempotencyKey: requestId.current
          })
        }
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not send your reply.");
      setBody("");
      requestId.current = "";
      await refresh();
      setState("sent");
    } catch (sendError) {
      setState("failed");
      setError(sendError instanceof Error ? sendError.message : "Could not send your reply.");
    }
  }

  const ticket = view.ticket;
  return (
    <main className="user-ticket-page" data-user-ticket-thread>
      <header className="user-ticket-header">
        <div>
          <Link href="/settings/feedback">Feedback</Link>
          <p>{ticket.publicId}</p>
          <h1>{ticket.subject}</h1>
        </div>
        <span className={`ticket-status ticket-status--${ticket.status.toLowerCase()}`}>{ticket.status}</span>
      </header>

      <section className="user-ticket-meta">
        <div><span>Type</span><strong>{ticket.kindLabel}</strong></div>
        <div><span>Created</span><strong>{formatDate(ticket.createdAt)}</strong></div>
        <div><span>Updated</span><strong>{formatDate(ticket.lastActivityAt)}</strong></div>
        <div><span>Source page</span><strong>{ticket.sourceRoute ?? "Not available"}</strong></div>
      </section>

      <section className="user-ticket-original">
        <h2>Original Feedback</h2>
        <p>{ticket.description}</p>
        {ticket.screenshot ? (
          <a className="user-ticket-screenshot" href={ticket.screenshot.href} rel="noreferrer" target="_blank">
            <img alt={`Screenshot submitted with ${ticket.publicId}`} src={ticket.screenshot.href} />
            <span>Open full screenshot</span>
          </a>
        ) : null}
      </section>

      <section className="user-ticket-conversation">
        <h2>Conversation</h2>
        <div className="ticket-messages">
          {ticket.messages.map((message) => (
            <article
              className={message.sender?.isAdmin ? "ticket-message ticket-message--admin" : "ticket-message ticket-message--creator"}
              key={message.id}
            >
              <header>
                <strong>{message.sender?.name ?? "Former member"}</strong>
                <span>{message.sender?.isAdmin ? "Theta-Space Administrator" : "You"}</span>
                <time>{formatDate(message.createdAt)}</time>
              </header>
              <p>{message.body}</p>
            </article>
          ))}
          {ticket.messages.length === 0 ? (
            <p className="user-feedback-empty">No replies yet.</p>
          ) : null}
        </div>

        <div className="user-ticket-reply">
          <label>
            <span className="form-label">Reply</span>
            <textarea
              className="form-field"
              onChange={(event) => {
                setBody(event.target.value);
                setState("idle");
              }}
              placeholder="Add information or answer an administrator..."
              value={body}
            />
          </label>
          {error ? <p className="feedback-inline-error" role="alert">{error}</p> : null}
          {state === "sent" ? <p className="ticket-message-sent" role="status">Reply sent.</p> : null}
          <button className="btn-primary" disabled={!body.trim() || state === "sending"} onClick={() => void sendReply()} type="button">
            {state === "sending" ? "Sending..." : state === "failed" ? "Retry Reply" : "Send Reply"}
          </button>
        </div>
      </section>
    </main>
  );
}
