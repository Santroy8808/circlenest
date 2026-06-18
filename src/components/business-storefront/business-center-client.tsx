"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { BusinessCenterView, BusinessProfileView } from "@/modules/business-storefront/types";

type FormState = {
  businessName: string;
  tagline: string;
  description: string;
  location: string;
  publicEmail: string;
  phone: string;
  website: string;
  publicStorefrontEnabled: boolean;
};

function initialForm(profile: BusinessProfileView | null): FormState {
  return {
    businessName: profile?.businessName ?? "",
    tagline: profile?.tagline ?? "",
    description: profile?.description ?? "",
    location: profile?.location ?? "",
    publicEmail: profile?.publicEmail ?? "",
    phone: profile?.phone ?? "",
    website: profile?.website ?? "",
    publicStorefrontEnabled: profile?.publicStorefrontEnabled ?? false
  };
}

export function BusinessCenterClient({ businessCenter }: { businessCenter: BusinessCenterView }) {
  const [profile, setProfile] = useState(businessCenter.profile);
  const [form, setForm] = useState<FormState>(() => initialForm(businessCenter.profile));
  const [message, setMessage] = useState("");
  const [error, setError] = useState(businessCenter.canManage ? "" : businessCenter.reason ?? "Professional access required.");
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    startTransition(async () => {
      const response = await fetch("/api/business/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const payload = (await response.json()) as { error?: string; profile?: BusinessProfileView };

      if (!response.ok || !payload.profile) {
        setError(payload.error ?? "Could not save business profile.");
        return;
      }

      setProfile(payload.profile);
      setMessage(payload.profile.publicStorefrontEnabled ? "Storefront saved and published." : "Business profile saved.");
    });
  }

  if (!businessCenter.canManage) {
    return (
      <section className="surface rounded-md p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Business Center</p>
        <h1 className="mt-3 text-3xl font-semibold">Professional access required</h1>
        <p className="mx-auto mt-3 max-w-xl leading-7 text-[var(--muted)]">{error}</p>
        <Link className="btn-secondary mt-5 inline-block" href="/production-zone">
          Back to Production Zone
        </Link>
      </section>
    );
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Business Center</p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Business profile and storefront</h1>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
              Build a Professional public storefront for non-members while keeping control inside Theta-Space.
            </p>
          </div>
          {profile?.publicStorefrontEnabled ? (
            <Link className="btn-secondary" href={profile.publicUrl}>
              View storefront
            </Link>
          ) : null}
        </div>
      </section>

      <form className="surface grid gap-5 rounded-md p-6" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="form-label">Business name</span>
            <input className="form-field" onChange={(event) => update("businessName", event.target.value)} value={form.businessName} />
          </label>
          <label className="grid gap-2">
            <span className="form-label">Tagline</span>
            <input className="form-field" onChange={(event) => update("tagline", event.target.value)} value={form.tagline} />
          </label>
        </div>

        <label className="grid gap-2">
          <span className="form-label">Description</span>
          <textarea
            className="form-field min-h-36 resize-y"
            onChange={(event) => update("description", event.target.value)}
            placeholder="What your business offers, who it serves, and how people should think about contacting you."
            value={form.description}
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="form-label">Location</span>
            <input className="form-field" onChange={(event) => update("location", event.target.value)} value={form.location} />
          </label>
          <label className="grid gap-2">
            <span className="form-label">Public email</span>
            <input className="form-field" onChange={(event) => update("publicEmail", event.target.value)} value={form.publicEmail} />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="form-label">Phone</span>
            <input className="form-field" onChange={(event) => update("phone", event.target.value)} value={form.phone} />
          </label>
          <label className="grid gap-2">
            <span className="form-label">Website</span>
            <input className="form-field" onChange={(event) => update("website", event.target.value)} placeholder="https://example.com" value={form.website} />
          </label>
        </div>

        <label className="flex items-start gap-3 rounded-md border border-[var(--line)] bg-black/10 p-4">
          <input
            checked={form.publicStorefrontEnabled}
            className="mt-1"
            onChange={(event) => update("publicStorefrontEnabled", event.target.checked)}
            type="checkbox"
          />
          <span>
            <span className="block font-semibold text-[var(--gold)]">Publish public storefront</span>
            <span className="mt-1 block text-sm leading-6 text-[var(--muted)]">
              Makes this page reachable outside the private member app. Inquiries are captured internally.
            </span>
          </span>
        </label>

        <section className="rounded-md border border-[var(--line)] bg-black/10 p-4">
          <h2 className="font-semibold text-[var(--gold)]">Coming soon: email linking</h2>
          <p className="mt-2 leading-6 text-[var(--muted)]">
            Professional storefronts are structured for future email-account linking, but external email is intentionally disabled in this phase.
          </p>
        </section>

        {profile ? (
          <p className="rounded-md border border-[var(--line)] bg-black/10 p-3 text-sm text-[var(--muted)]">
            Public URL: <span className="text-[var(--text)]">{profile.publicUrl}</span>
          </p>
        ) : null}
        {message ? <p className="rounded-md border border-emerald-400/40 bg-emerald-950/30 p-3 text-sm text-emerald-100">{message}</p> : null}
        {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}

        <div className="flex justify-end gap-3">
          <Link className="btn-secondary" href="/production-zone">
            Cancel
          </Link>
          <button className="btn-primary" disabled={isPending || form.businessName.trim().length < 2} type="submit">
            {isPending ? "Saving..." : "Save business profile"}
          </button>
        </div>
      </form>

      <section className="surface rounded-md p-6">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Recent inquiries</h2>
        <p className="mt-2 text-[var(--muted)]">External storefront inquiries land here. Reply workflow belongs to future mail/external-email phases.</p>
        <div className="mt-5 grid gap-3">
          {businessCenter.inquiries.length > 0 ? (
            businessCenter.inquiries.map((inquiry) => (
              <article className="module-card rounded-md p-4" key={inquiry.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold">{inquiry.senderName}</h3>
                  <span className="pill rounded-full px-3 py-1 text-xs">{new Date(inquiry.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">{inquiry.senderEmail ?? "No email supplied"}</p>
                <p className="mt-3 leading-6">{inquiry.message}</p>
              </article>
            ))
          ) : (
            <p className="rounded-md border border-dashed border-[var(--line)] p-5 text-[var(--muted)]">No storefront inquiries yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
