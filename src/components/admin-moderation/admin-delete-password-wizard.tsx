"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { DeleteProtectionAdminView } from "@/modules/admin-moderation/delete-protection.service";

export function AdminDeletePasswordWizard({ initialView }: { initialView: DeleteProtectionAdminView }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newDeletePassword, setNewDeletePassword] = useState("");
  const [reason, setReason] = useState("Update shared DELETE password.");
  const [message, setMessage] = useState("");
  const [view, setView] = useState(initialView);
  const [isPending, startTransition] = useTransition();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    startTransition(async () => {
      const response = await fetch("/api/admin/delete-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: currentPassword,
          deletePassword: newDeletePassword,
          reason
        })
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string; view?: DeleteProtectionAdminView };

      if (!response.ok) {
        setMessage(payload.error ?? "Could not update the DELETE password.");
        return;
      }

      if (payload.view) {
        setView(payload.view);
      }
      setCurrentPassword("");
      setNewDeletePassword("");
      setReason("Update shared DELETE password.");
      setMessage("DELETE password updated.");
    });
  }

  return (
    <section className="surface rounded-md p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Admin Settings</p>
      <h1 className="mt-3 text-3xl font-semibold">Delete Password</h1>
      <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
        This password protects destructive delete actions across the platform. Changing it updates the shared confirmation check used by posts,
        media, mail, invites, group tools, and other delete surfaces.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <article className="rounded-md border border-[var(--line)] bg-black/10 p-4">
          <p className="text-sm uppercase tracking-[0.22em] text-[var(--gold)]">Current source</p>
          <p className="mt-2 font-semibold">{view.currentSource}</p>
        </article>
        <article className="rounded-md border border-[var(--line)] bg-black/10 p-4">
          <p className="text-sm uppercase tracking-[0.22em] text-[var(--gold)]">Mode</p>
          <p className="mt-2 font-semibold">{view.mode === "custom" ? "Database override" : "Environment fallback"}</p>
        </article>
        <article className="rounded-md border border-[var(--line)] bg-black/10 p-4">
          <p className="text-sm uppercase tracking-[0.22em] text-[var(--gold)]">Last changed</p>
          <p className="mt-2 font-semibold">{view.configuredAt ? new Date(view.configuredAt).toLocaleString() : "Not yet customized"}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">{view.updatedByLabel ? `By ${view.updatedByLabel}` : "No admin update recorded."}</p>
        </article>
      </div>

      <form className="mt-6 grid gap-4" onSubmit={submit}>
        <label className="grid gap-2">
          <span className="form-label">Your admin account password</span>
          <input className="form-field" onChange={(event) => setCurrentPassword(event.target.value)} type="password" value={currentPassword} />
        </label>
        <label className="grid gap-2">
          <span className="form-label">New DELETE password</span>
          <input
            className="form-field"
            onChange={(event) => setNewDeletePassword(event.target.value)}
            placeholder="Enter the new shared delete password"
            type="password"
            value={newDeletePassword}
          />
        </label>
        <label className="grid gap-2">
          <span className="form-label">Reason</span>
          <textarea className="form-field min-h-28" onChange={(event) => setReason(event.target.value)} value={reason} />
        </label>
        <p className="text-sm text-[var(--muted)]">
          Changing this password will immediately affect all destructive-delete confirmations that rely on the shared DELETE password.
        </p>
        {message ? <p className="rounded-md border border-[var(--line)] bg-black/10 p-4 text-sm">{message}</p> : null}
        <div className="flex flex-wrap gap-3">
          <button className="btn-primary" disabled={isPending || !currentPassword || !newDeletePassword || reason.trim().length < 10} type="submit">
            Update delete password
          </button>
        </div>
      </form>
    </section>
  );
}
