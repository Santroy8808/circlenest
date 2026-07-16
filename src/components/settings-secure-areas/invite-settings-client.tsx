"use client";

import { useState, useTransition } from "react";
import { promptForDeletePassword, withDeletePassword } from "@/lib/client/delete-password";

type OwnInvite = {
  id: string;
  codePreview: string;
  recipientEmail: string | null;
  emailedAt: string | null;
  usedAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
};

type BulkInviteBatch = {
  id: string;
  requestedCount: number;
  acceptedCount: number;
  skippedCount: number;
  sentCount: number;
  failedCount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export function InviteSettingsClient({
  canInvite,
  canBulkInvite,
  reason,
  bulkReason,
  initialInvites,
  initialBulkBatches
}: {
  canInvite: boolean;
  canBulkInvite: boolean;
  reason: string;
  bulkReason: string;
  initialInvites: OwnInvite[];
  initialBulkBatches: BulkInviteBatch[];
}) {
  const [recipientEmail, setRecipientEmail] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [bulkEmails, setBulkEmails] = useState("");
  const [invites, setInvites] = useState(initialInvites);
  const [bulkBatches, setBulkBatches] = useState(initialBulkBatches);
  const [generatedCode, setGeneratedCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const bulkAddressCount = bulkEmails.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+/gi)?.filter((email, index, values) => values.findIndex((candidate) => candidate.toLowerCase() === email.toLowerCase()) === index).length ?? 0;

  function generateInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGeneratedCode("");
    setMessage("");
    setError("");

    startTransition(async () => {
      const response = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail,
          sendEmail,
          expiresInDays
        })
      });
      const payload = (await response.json()) as { error?: string; inviteCode?: string; invites?: OwnInvite[] };

      if (!response.ok || !payload.inviteCode) {
        setError(payload.error ?? "Could not generate invite.");
        return;
      }

      setGeneratedCode(payload.inviteCode);
      setInvites(payload.invites ?? invites);
      setMessage(sendEmail ? "Invite code generated and emailed." : "Invite code generated.");
    });
  }

  function queueBulkInvites(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGeneratedCode("");
    setMessage("");
    setError("");

    startTransition(async () => {
      const response = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk", emails: bulkEmails, expiresInDays })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; bulkBatches?: BulkInviteBatch[]; queuedCount?: number; skippedCount?: number } | null;
      if (!response.ok) {
        setError(payload?.error ?? "Could not queue bulk invitations.");
        return;
      }
      setBulkBatches(payload?.bulkBatches ?? bulkBatches);
      setBulkEmails("");
      setMessage(`${payload?.queuedCount ?? 0} invitations queued. Each email will receive a unique one-time code.`);
    });
  }

  function revokeInvite(inviteId: string) {
    setMessage("");
    setError("");
    const deletePassword = promptForDeletePassword();
    if (!deletePassword) {
      setError("Invite revocation cancelled. DELETE password was not entered.");
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/invites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withDeletePassword({ inviteId }, deletePassword))
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; invites?: OwnInvite[] } | null;

      if (!response.ok) {
        setError(payload?.error ?? "Could not revoke invite.");
        return;
      }

      setInvites(payload?.invites ?? []);
      setMessage("Invite revoked.");
    });
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-md border border-[var(--line)] bg-black/10 p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Generate free account invite</h2>
        <p className="mt-2 leading-6 text-[var(--muted)]">{reason}</p>
        {canInvite ? (
          <form className="mt-5 grid gap-4" onSubmit={generateInvite}>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_160px]">
              <label className="grid gap-2">
                <span className="form-label">Recipient email</span>
                <input className="form-field" onChange={(event) => setRecipientEmail(event.target.value)} type="email" value={recipientEmail} />
              </label>
              <label className="grid gap-2">
                <span className="form-label">Expires in days</span>
                <input className="form-field" max={90} min={1} onChange={(event) => setExpiresInDays(Number(event.target.value))} type="number" value={expiresInDays} />
              </label>
            </div>
            <label className="flex items-center gap-3 rounded-md border border-[var(--line)] bg-black/10 p-4">
              <input checked={sendEmail} onChange={(event) => setSendEmail(event.target.checked)} type="checkbox" />
              Email this invite code immediately.
            </label>
            <button className="btn-primary w-fit" disabled={isPending || (sendEmail && recipientEmail.trim().length < 3)} type="submit">
              {isPending ? "Generating..." : "Generate invite code"}
            </button>
          </form>
        ) : null}
        {generatedCode ? (
          <div className="mt-4 rounded-md border border-[var(--line)] bg-black/20 p-4">
            <p className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">Generated code</p>
            <p className="mt-2 font-mono text-xl text-[var(--gold)]">{generatedCode}</p>
          </div>
        ) : null}
        {message ? <p className="mt-4 rounded-md border border-emerald-400/40 bg-emerald-950/30 p-3 text-sm text-emerald-100">{message}</p> : null}
        {error ? <p className="mt-4 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
      </section>

      {canBulkInvite ? (
        <section className="rounded-md border border-[var(--line)] bg-black/10 p-5">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">Invite multiple</h2>
          <p className="mt-2 max-w-3xl leading-6 text-[var(--muted)]">
            Paste a list of addresses in any format, including comma-, space-, or line-separated names such as <span className="font-mono">Jane Doe &lt;jane@example.com&gt;</span>. We extract and de-duplicate valid addresses, create one unique one-time code per person, and queue delivery at one email every 2 minutes. Bulk invitations are capped at 300 addresses per UTC day and 250 per batch.
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">{bulkReason} {bulkAddressCount > 0 ? `${bulkAddressCount} unique address${bulkAddressCount === 1 ? "" : "es"} detected.` : "No addresses detected yet."}</p>
          <form className="mt-5 grid gap-4" onSubmit={queueBulkInvites}>
            <label className="grid gap-2">
              <span className="form-label">Email list</span>
              <textarea className="form-field min-h-40" onChange={(event) => setBulkEmails(event.target.value)} placeholder={'Paste emails here, for example:\nJane Doe <jane@example.com>, alex@example.com'} value={bulkEmails} />
            </label>
            <label className="grid max-w-[180px] gap-2">
              <span className="form-label">Expires in days</span>
              <input className="form-field" max={90} min={1} onChange={(event) => setExpiresInDays(Number(event.target.value))} type="number" value={expiresInDays} />
            </label>
            <button className="btn-primary w-fit" disabled={isPending || bulkAddressCount === 0} type="submit">
              {isPending ? "Queueing..." : "Queue invitations"}
            </button>
          </form>
          <div className="mt-5 grid gap-3">
            <h3 className="text-lg font-semibold text-[var(--gold)]">Recent bulk queues</h3>
            {bulkBatches.length > 0 ? bulkBatches.map((batch) => (
              <article className="module-card rounded-md p-4" key={batch.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <strong>{batch.acceptedCount} queued</strong>
                  <span className="pill rounded-full px-3 py-1 text-xs">{batch.status}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">{batch.sentCount} sent, {batch.failedCount} failed, {batch.skippedCount} skipped. Created {new Date(batch.createdAt).toLocaleString()}.</p>
              </article>
            )) : <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-[var(--muted)]">No bulk invitation queues yet.</p>}
          </div>
        </section>
      ) : null}

      <section className="rounded-md border border-[var(--line)] bg-black/10 p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Active invite codes</h2>
        <div className="mt-4 grid gap-3">
          {invites.length > 0 ? (
            invites.map((invite) => (
              <article className="module-card rounded-md p-4" key={invite.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <strong>{invite.codePreview}</strong>
                  <span className="pill rounded-full px-3 py-1 text-xs">Available</span>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Recipient: {invite.recipientEmail ?? "Any email"} / Expires {new Date(invite.expiresAt).toLocaleDateString()}
                </p>
                <button className="btn-secondary mt-3 px-3 py-2 text-sm" disabled={isPending} onClick={() => revokeInvite(invite.id)} type="button">
                  Revoke unused invite
                </button>
              </article>
            ))
          ) : (
            <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-[var(--muted)]">No active invite codes.</p>
          )}
        </div>
      </section>
    </div>
  );
}
