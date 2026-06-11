"use client";

import { useState } from "react";
import type { BusinessProfileSummary } from "@/lib/business/business-profile";

type Props = {
  canCreate: boolean;
  accessReason: string | null;
  ownProfile: BusinessProfileSummary | null;
  publicProfiles: BusinessProfileSummary[];
};

export function BusinessProfileManager({ canCreate, accessReason, ownProfile, publicProfiles }: Props) {
  const [businessName, setBusinessName] = useState(ownProfile?.businessName ?? "");
  const [tagline, setTagline] = useState(ownProfile?.tagline ?? "");
  const [description, setDescription] = useState(ownProfile?.description ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(ownProfile?.websiteUrl ?? "");
  const [contactEmail, setContactEmail] = useState(ownProfile?.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(ownProfile?.contactPhone ?? "");
  const [category, setCategory] = useState(ownProfile?.category ?? "");
  const [location, setLocation] = useState(ownProfile?.location ?? "");
  const [country, setCountry] = useState(ownProfile?.country ?? "");
  const [state, setState] = useState(ownProfile?.state ?? "");
  const [city, setCity] = useState(ownProfile?.city ?? "");
  const [isPublic, setIsPublic] = useState(ownProfile?.isPublic ?? true);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveProfile() {
    setSaving(true);
    setStatus("");
    try {
      const response = await fetch("/api/business-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: businessName.trim(),
          tagline: tagline.trim() || null,
          description: description.trim() || null,
          websiteUrl: websiteUrl.trim() || null,
          contactEmail: contactEmail.trim() || null,
          contactPhone: contactPhone.trim() || null,
          category: category.trim() || null,
          location: location.trim() || null,
          country: country.trim() || null,
          state: state.trim() || null,
          city: city.trim() || null,
          isPublic,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setStatus(payload.error ?? "Could not save business profile.");
        return;
      }
      window.location.reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3 p-4">
        <div>
          <h2 className="text-lg font-semibold">My Business Profile</h2>
          <p className="text-xs text-slate-400">
            {canCreate ? "Create or update your business profile here." : accessReason ?? "Browse only."}
          </p>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <input
            value={businessName}
            onChange={(event) => setBusinessName(event.target.value)}
            disabled={!canCreate}
            placeholder="Business name"
            className="rounded border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
          />
          <input
            value={tagline}
            onChange={(event) => setTagline(event.target.value)}
            disabled={!canCreate}
            placeholder="Tagline"
            className="rounded border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
          />
          <input
            value={websiteUrl}
            onChange={(event) => setWebsiteUrl(event.target.value)}
            disabled={!canCreate}
            placeholder="Website"
            className="rounded border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
          />
          <input
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
            disabled={!canCreate}
            placeholder="Contact email"
            className="rounded border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
          />
          <input
            value={contactPhone}
            onChange={(event) => setContactPhone(event.target.value)}
            disabled={!canCreate}
            placeholder="Contact phone"
            className="rounded border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
          />
          <input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            disabled={!canCreate}
            placeholder="Category"
            className="rounded border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
          />
          <input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            disabled={!canCreate}
            placeholder="Location"
            className="rounded border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
          />
          <input
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            disabled={!canCreate}
            placeholder="Country"
            className="rounded border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
          />
          <input
            value={state}
            onChange={(event) => setState(event.target.value)}
            disabled={!canCreate}
            placeholder="State"
            className="rounded border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
          />
          <input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            disabled={!canCreate}
            placeholder="City"
            className="rounded border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
          />
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={!canCreate}
            placeholder="Business description"
            className="min-h-28 rounded border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 md:col-span-2"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} disabled={!canCreate} />
          Public profile
        </label>

        <button
          type="button"
          disabled={!canCreate || saving || !businessName.trim()}
          onClick={() => void saveProfile()}
          className="rounded bg-[#8f7228] px-3 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : ownProfile ? "Save business profile" : "Create business profile"}
        </button>
        {status ? <p className="text-xs text-slate-400">{status}</p> : null}
      </section>

      <section className="card space-y-3 p-4">
        <div>
          <h2 className="text-lg font-semibold">Public Business Profiles</h2>
          <p className="text-xs text-slate-400">Browse public profiles on the platform.</p>
        </div>
        <div className="space-y-2">
          {publicProfiles.length ? (
            publicProfiles.map((profile) => (
              <article key={profile.id} className="rounded border border-[var(--border)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-100">{profile.businessName}</p>
                    <p className="text-xs text-slate-400">@{profile.owner.username}{profile.owner.fullName ? ` • ${profile.owner.fullName}` : ""}</p>
                  </div>
                  <span className="rounded-full border border-slate-400/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                    {profile.category || "Business"}
                  </span>
                </div>
                {profile.tagline ? <p className="mt-2 text-sm text-slate-300">{profile.tagline}</p> : null}
                {profile.description ? <p className="mt-2 text-sm text-slate-400">{profile.description}</p> : null}
                <p className="mt-2 text-xs text-slate-500">
                  {profile.location || "No location"} {profile.websiteUrl ? `• ${profile.websiteUrl}` : ""}
                </p>
              </article>
            ))
          ) : (
            <p className="text-sm text-slate-500">No public business profiles yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
