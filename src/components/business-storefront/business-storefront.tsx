"use client";

import { useState, useTransition } from "react";
import type { BusinessProfileView } from "@/modules/business-storefront/types";

export function BusinessStorefront({ profile }: { profile: BusinessProfileView }) {
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    setError("");

    startTransition(async () => {
      const response = await fetch(`/api/storefront/${profile.slug}/inquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderName,
          senderEmail,
          message
        })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not send inquiry.");
        return;
      }

      setSenderName("");
      setSenderEmail("");
      setMessage("");
      setStatus("Inquiry sent. The business owner will see it inside Theta-Space.");
    });
  }

  return (
    <div className="grid gap-5">
      <section className="business-storefront-hero rounded-md p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Theta-Space Storefront</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold">{profile.businessName}</h1>
        {profile.tagline ? <p className="mt-4 max-w-2xl text-xl text-[var(--muted)]">{profile.tagline}</p> : null}
        <div className="mt-6 flex flex-wrap gap-2">
          {profile.location ? <span className="pill rounded-full px-3 py-1 text-sm">{profile.location}</span> : null}
          <span className="pill rounded-full px-3 py-1 text-sm">Public business profile</span>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="surface rounded-md p-6">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">About</h2>
          <p className="mt-4 whitespace-pre-wrap leading-7 text-[var(--text)]">
            {profile.description ?? "This business has not added a full description yet."}
          </p>
          <div className="mt-6 grid gap-3 text-sm text-[var(--muted)]">
            {profile.publicEmail ? <p>Email: {profile.publicEmail}</p> : null}
            {profile.phone ? <p>Phone: {profile.phone}</p> : null}
            {profile.website ? (
              <p>
                Website:{" "}
                <a className="text-[var(--gold)] underline" href={profile.website} rel="noreferrer" target="_blank">
                  {profile.website}
                </a>
              </p>
            ) : null}
          </div>
        </section>

        <form className="surface grid gap-4 rounded-md p-6" onSubmit={submit}>
          <div>
            <h2 className="text-2xl font-semibold text-[var(--gold)]">Send an inquiry</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">This sends a private inquiry into the owner&apos;s Business Center.</p>
          </div>
          <label className="grid gap-2">
            <span className="form-label">Your name</span>
            <input className="form-field" onChange={(event) => setSenderName(event.target.value)} value={senderName} />
          </label>
          <label className="grid gap-2">
            <span className="form-label">Email, optional</span>
            <input className="form-field" onChange={(event) => setSenderEmail(event.target.value)} value={senderEmail} />
          </label>
          <label className="grid gap-2">
            <span className="form-label">Message</span>
            <textarea className="form-field min-h-32 resize-y" onChange={(event) => setMessage(event.target.value)} value={message} />
          </label>
          {status ? <p className="rounded-md border border-emerald-400/40 bg-emerald-950/30 p-3 text-sm text-emerald-100">{status}</p> : null}
          {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
          <button className="btn-primary" disabled={isPending || senderName.trim().length < 2 || message.trim().length < 10} type="submit">
            {isPending ? "Sending..." : "Send inquiry"}
          </button>
        </form>
      </div>
    </div>
  );
}
