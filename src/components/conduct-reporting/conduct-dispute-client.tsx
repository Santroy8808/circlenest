"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type DisputeView = {
  reference: string;
  status: string;
  report: { reference: string; reasonCode: string; status: string };
  incident: { reference: string; permalink: string; locationType: string; evidenceSnapshot: unknown };
  messages: Array<{ id: string; authorUserId: string; body: string; linkedContentUrl: string | null; createdAt: string }>;
  participants: Array<{ id: string; userId: string; selectedResolvedAt: string | null }>;
  isParticipant: boolean;
};

export function ConductDisputeClient({ initialView }: { initialView: DisputeView }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [linkedContentUrl, setLinkedContentUrl] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function act(action: "statement" | "resolved") {
    setError("");
    startTransition(async () => {
      const response = await fetch(`/api/conduct/disputes/${encodeURIComponent(initialView.reference)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, body, linkedContentUrl })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not update the dispute.");
        return;
      }
      setBody("");
      setLinkedContentUrl("");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Conduct Dispute</p>
        <h1 className="mt-3 text-3xl font-semibold">{initialView.reference}</h1>
        <p className="mt-3 text-[var(--muted)]">Report {initialView.report.reference} · {initialView.status.toLowerCase()}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="btn-secondary" href={initialView.incident.permalink}>View source</Link>
          <Link className="btn-secondary" href="/settings/reports">Back to folder</Link>
        </div>
      </section>
      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Statements</h2>
        <div className="mt-4 grid gap-3">
          {initialView.messages.length === 0 ? <p className="text-[var(--muted)]">No statements yet.</p> : null}
          {initialView.messages.map((message) => (
            <article className="rounded-md border border-[var(--line)] p-4" key={message.id}>
              <p className="text-xs text-[var(--muted)]">Account {message.authorUserId} · {new Date(message.createdAt).toLocaleString()}</p>
              <p className="mt-2 whitespace-pre-wrap leading-7">{message.body}</p>
              {message.linkedContentUrl ? <Link className="mt-2 inline-flex text-sm text-[var(--gold)]" href={message.linkedContentUrl}>Linked public/group content</Link> : null}
            </article>
          ))}
        </div>
      </section>
      {initialView.status === "OPEN" && initialView.isParticipant ? (
        <section className="surface rounded-md p-5">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">Add a statement</h2>
          <textarea className="form-field mt-4 min-h-36 resize-y" maxLength={5000} onChange={(event) => setBody(event.target.value)} value={body} />
          <input className="form-field mt-3" onChange={(event) => setLinkedContentUrl(event.target.value)} placeholder="Optional internal link to public/group content" value={linkedContentUrl} />
          {error ? <p className="mt-3 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
          <div className="mt-4 flex flex-wrap justify-end gap-3">
            <button className="btn-secondary" disabled={isPending} onClick={() => act("resolved")} type="button">I consider this resolved</button>
            <button className="btn-primary" disabled={isPending || body.trim().length < 2} onClick={() => act("statement")} type="button">Add statement</button>
          </div>
          <p className="mt-3 text-sm text-[var(--muted)]">The dispute closes only after every required participant selects resolved, or a moderator records an explicit override.</p>
        </section>
      ) : null}
    </div>
  );
}
