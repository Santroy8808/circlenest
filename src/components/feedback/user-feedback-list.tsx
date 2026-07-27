"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { UserFeedbackTicketListView } from "@/modules/feedback-support/feedback-support.service";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function UserFeedbackList({ initialView }: { initialView: UserFeedbackTicketListView }) {
  const [view, setView] = useState(initialView);
  const [error, setError] = useState("");

  async function refresh(quiet = false) {
    try {
      const response = await fetch("/api/feedback/tickets", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as UserFeedbackTicketListView & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not refresh Feedback.");
      setView(payload);
      if (!quiet) setError("");
    } catch (refreshError) {
      if (!quiet) setError(refreshError instanceof Error ? refreshError.message : "Could not refresh Feedback.");
    }
  }

  useEffect(() => {
    const handleSubmitted = () => void refresh();
    window.addEventListener("theta:feedback-submitted", handleSubmitted);
    const interval = window.setInterval(() => void refresh(true), 30_000);
    return () => {
      window.removeEventListener("theta:feedback-submitted", handleSubmitted);
      window.clearInterval(interval);
    };
  }, []);

  return (
    <main className="user-feedback-page" data-user-feedback>
      <header className="user-feedback-header">
        <div>
          <p>Settings</p>
          <h1>Feedback</h1>
          <span>Track the Feedback you have submitted and replies from Theta-Space administrators.</span>
        </div>
        <button
          className="btn-primary"
          onClick={() => window.dispatchEvent(new Event("theta:open-feedback"))}
          type="button"
        >
          New Feedback
        </button>
      </header>

      {error ? <p className="feedback-inline-error" role="alert">{error}</p> : null}

      <section className="user-feedback-list" aria-label="Your Feedback tickets">
        <div className="user-feedback-list-head">
          <span>Ticket</span>
          <span>Type</span>
          <span>Subject</span>
          <span>Status</span>
          <span>Created</span>
          <span>Updated</span>
        </div>
        {view.tickets.map((ticket) => (
          <Link
            className={ticket.unread ? "user-feedback-row user-feedback-row--unread" : "user-feedback-row"}
            href={`/feedback/tickets/${encodeURIComponent(ticket.publicId)}`}
            key={ticket.publicId}
          >
            <span data-label="Ticket"><strong>{ticket.publicId}</strong>{ticket.unread ? <small>Unread reply</small> : null}</span>
            <span data-label="Type">{ticket.kindLabel}</span>
            <span className="user-feedback-subject" data-label="Subject">{ticket.subject}</span>
            <span data-label="Status"><strong className={`ticket-status ticket-status--${ticket.status.toLowerCase()}`}>{ticket.status}</strong></span>
            <span data-label="Created">{formatDate(ticket.createdAt)}</span>
            <span data-label="Updated">{formatDate(ticket.lastActivityAt)}</span>
          </Link>
        ))}
        {view.tickets.length === 0 ? (
          <div className="user-feedback-empty">
            <strong>No Feedback yet</strong>
            <p>Use the Feedback button whenever you need help or want to suggest an improvement.</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
