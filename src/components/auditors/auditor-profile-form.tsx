"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { MyAuditorProfileView } from "@/modules/auditors/types";

export function AuditorProfileForm({ data }: { data: MyAuditorProfileView }) {
  const [practiceName, setPracticeName] = useState(data.profile?.practiceName ?? "");
  const [location, setLocation] = useState(data.profile?.location ?? "");
  const [willingToTravel, setWillingToTravel] = useState(data.profile?.willingToTravel ?? false);
  const [bio, setBio] = useState(data.profile?.bio ?? "");
  const [offerings, setOfferings] = useState(data.profile?.offerings ?? "");
  const [phone, setPhone] = useState(data.profile?.phone ?? "");
  const [website, setWebsite] = useState(data.profile?.website ?? "");
  const [active, setActive] = useState(data.profile?.active ?? true);
  const [error, setError] = useState(data.canCreate ? "" : data.reason ?? "Auditor profile access required.");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submitProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    startTransition(async () => {
      const response = await fetch("/api/auditors/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practiceName,
          location,
          willingToTravel,
          bio,
          offerings,
          phone,
          website,
          active
        })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not save auditor profile.");
        return;
      }

      setMessage("Auditor profile saved.");
    });
  }

  if (!data.canCreate) {
    return (
      <section className="surface rounded-md p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Auditor profiles</p>
        <h1 className="mt-3 text-3xl font-semibold text-[var(--gold)]">Coming Soon</h1>
        <p className="mt-3 text-[var(--muted)]">Auditor profile creation is not currently available for this membership.</p>
        <Link className="btn-secondary mt-5 inline-block" href="/auditors">
          Find an Auditor
        </Link>
      </section>
    );
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">My Scientology Source</p>
        <div className="mt-4 grid gap-2 text-[var(--muted)]">
          <p>Classification: {data.scientology.classification}</p>
          <p>Org: {data.scientology.orgName || "Not set"}</p>
          <p>Training: {data.scientology.trainingLevel || "Not set"}</p>
          <p>Processing: {data.scientology.processingStatus || "Not set"}</p>
        </div>
      </section>

      <form className="surface grid gap-5 rounded-md p-6" onSubmit={submitProfile}>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">I&apos;m an Auditor</p>
          <h1 className="mt-3 text-3xl font-semibold">Build your auditor profile</h1>
          <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
            This creates a separate auditor profile you can switch into. My Scientology remains the education source; these fields describe your practice.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <input className="form-field" onChange={(event) => setPracticeName(event.target.value)} placeholder="Practice name" value={practiceName} />
          <input className="form-field" onChange={(event) => setLocation(event.target.value)} placeholder="Location" value={location} />
        </div>
        <textarea className="form-field min-h-32 resize-y" onChange={(event) => setOfferings(event.target.value)} placeholder="What I offer" value={offerings} />
        <textarea className="form-field min-h-32 resize-y" onChange={(event) => setBio(event.target.value)} placeholder="Who I am" value={bio} />
        <div className="grid gap-4 md:grid-cols-2">
          <input className="form-field" onChange={(event) => setPhone(event.target.value)} placeholder="Phone, optional" value={phone} />
          <input className="form-field" onChange={(event) => setWebsite(event.target.value)} placeholder="Website, optional" value={website} />
        </div>
        <div className="flex flex-wrap gap-5 text-sm text-[var(--muted)]">
          <label className="flex items-center gap-3">
            <input checked={willingToTravel} onChange={(event) => setWillingToTravel(event.target.checked)} type="checkbox" />
            Willing to travel
          </label>
          <label className="flex items-center gap-3">
            <input checked={active} onChange={(event) => setActive(event.target.checked)} type="checkbox" />
            Publish in directory
          </label>
        </div>

        {message ? <p className="rounded-md border border-[var(--line)] p-3 text-sm text-[var(--gold)]">{message}</p> : null}
        {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}

        <div className="flex justify-end gap-3">
          <Link className="btn-secondary" href="/auditors">
            Cancel
          </Link>
          <button className="btn-primary" disabled={isPending || practiceName.trim().length < 2} type="submit">
            {isPending ? "Saving..." : "Save auditor profile"}
          </button>
        </div>
      </form>
    </div>
  );
}
