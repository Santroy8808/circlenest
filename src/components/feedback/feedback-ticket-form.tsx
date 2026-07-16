"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

type FeedbackTicketKind = "SUPPORT_REQUEST" | "ISSUE_REPORT" | "FEATURE_REQUEST";

function kindDescription(kind: FeedbackTicketKind) {
  if (kind === "SUPPORT_REQUEST") return "Ask for help using Theta-Space or resolve an account or access question.";
  if (kind === "FEATURE_REQUEST") return "Suggest a new feature or an improvement to something that already exists.";
  return "Tell us about a problem so we can reproduce it and fix it.";
}

export function FeedbackTicketForm({
  from = "/",
  initialKind = "ISSUE_REPORT",
  showKindSelector = true
}: {
  from?: string;
  initialKind?: FeedbackTicketKind;
  showKindSelector?: boolean;
}) {
  const [error, setError] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [kind, setKind] = useState<FeedbackTicketKind>(initialKind);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setTicketId("");
    const form = event.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      const response = await fetch("/api/feedback/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.get("title"),
          description: formData.get("description"),
          kind: formData.get("kind"),
          reporterEmail: formData.get("reporterEmail"),
          severity: formData.get("severity"),
          pageUrl: from,
          diagnostics: {
            viewport: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : undefined,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          }
        })
      });
      const payload = (await response.json().catch(() => ({ error: "The ticket service returned an unreadable response." }))) as {
        error?: string;
        publicId?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? "Could not create ticket.");
        return;
      }

      setTicketId(payload.publicId ?? "");
      form.reset();
    });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <div className="rounded-md border border-[var(--line)] bg-black/20 p-3 text-sm text-[var(--muted)]">
        Reporting from <span className="text-[var(--text)]">{from}</span>
      </div>
      {showKindSelector ? (
        <label className="grid gap-2">
          <span className="form-label">What would you like to send?</span>
          <select className="form-field" name="kind" onChange={(event) => setKind(event.target.value as FeedbackTicketKind)} value={kind}>
            <option value="SUPPORT_REQUEST">Support request</option>
            <option value="ISSUE_REPORT">Report a problem</option>
            <option value="FEATURE_REQUEST">Feature request</option>
          </select>
          <span className="text-sm leading-6 text-[var(--muted)]">{kindDescription(kind)}</span>
        </label>
      ) : (
        <input name="kind" type="hidden" value={kind} />
      )}
      <label className="grid gap-2">
        <span className="form-label">Short title</span>
        <input className="form-field" name="title" placeholder={kind === "FEATURE_REQUEST" ? "Example: Add saved searches" : kind === "SUPPORT_REQUEST" ? "Example: Help me update my profile" : "Example: Gallery upload froze"} required />
      </label>
      <label className="grid gap-2">
        <span className="form-label">{kind === "ISSUE_REPORT" ? "What happened?" : "Tell us what you need"}</span>
        <textarea className="form-field min-h-36 resize-y" name="description" placeholder={kind === "FEATURE_REQUEST" ? "Describe the improvement, who it would help, and how you would use it." : kind === "SUPPORT_REQUEST" ? "Describe your question or the help you need. Include the page or feature if you know it." : "Tell us what you clicked, what you expected, and what happened."} required />
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="form-label">Severity</span>
          <select className="form-field" name="severity" defaultValue="normal">
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
        <label className="grid gap-2">
          <span className="form-label">Contact email</span>
          <input className="form-field" name="reporterEmail" type="email" placeholder="Optional if logged out" />
        </label>
      </div>
      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
      {ticketId ? (
        <p className="rounded-md border border-green-400/40 bg-green-950/30 p-3 text-sm text-green-100">
          {kind === "FEATURE_REQUEST" ? "Feature request" : kind === "SUPPORT_REQUEST" ? "Support request" : "Problem report"} created: {ticketId}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button className="btn-primary" disabled={isPending} type="submit">
          {isPending ? "Creating ticket..." : "Create ticket"}
        </button>
        <Link className="btn-secondary" href={from || "/"}>
          Back
        </Link>
      </div>
    </form>
  );
}
