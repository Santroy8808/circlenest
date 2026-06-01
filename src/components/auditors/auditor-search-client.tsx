"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Listing = {
  id: string;
  displayName: string;
  classLevel: string;
  location: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  travels: boolean;
  lookingForPcs: boolean;
  bio: string | null;
  services: string | null;
  user: { id: string; username: string };
};

export function AuditorSearchClient({ initialListings }: { initialListings: Listing[] }) {
  const [listings, setListings] = useState(initialListings);
  const [search, setSearch] = useState({
    q: "",
    classLevel: "",
    country: "",
    state: "",
    city: "",
    lookingForPcs: true,
  });

  async function runSearch() {
    const query = new URLSearchParams();
    if (search.q) query.set("q", search.q);
    if (search.classLevel) query.set("classLevel", search.classLevel);
    if (search.country) query.set("country", search.country);
    if (search.state) query.set("state", search.state);
    if (search.city) query.set("city", search.city);
    if (search.lookingForPcs) query.set("lookingForPcs", "1");
    const res = await fetch(`/api/auditors?${query.toString()}`, { cache: "no-store" });
    const body = (await res.json().catch(() => null)) as Listing[] | null;
    if (Array.isArray(body)) setListings(body);
  }

  const searchable = useMemo(() => listings.filter((item) => item.lookingForPcs), [listings]);

  return (
    <section className="card space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Find an Auditor</h1>
          <p className="text-sm text-slate-300">Browse auditor listings and search by location, class level, or keywords.</p>
        </div>
        <Link href="/auditors/im-an-auditor" className="rounded border border-[var(--border)] px-3 py-2 text-sm">
          I&apos;m an Auditor
        </Link>
      </div>

      <div className="grid gap-2 md:grid-cols-6">
        <input
          value={search.q}
          onChange={(e) => setSearch((p) => ({ ...p, q: e.target.value }))}
          placeholder="Search"
          className="rounded border px-3 py-2 md:col-span-2"
        />
        <input
          value={search.classLevel}
          onChange={(e) => setSearch((p) => ({ ...p, classLevel: e.target.value }))}
          placeholder="Class level"
          className="rounded border px-3 py-2"
        />
        <input
          value={search.country}
          onChange={(e) => setSearch((p) => ({ ...p, country: e.target.value }))}
          placeholder="Country"
          className="rounded border px-3 py-2"
        />
        <input
          value={search.state}
          onChange={(e) => setSearch((p) => ({ ...p, state: e.target.value }))}
          placeholder="State"
          className="rounded border px-3 py-2"
        />
        <input
          value={search.city}
          onChange={(e) => setSearch((p) => ({ ...p, city: e.target.value }))}
          placeholder="City"
          className="rounded border px-3 py-2"
        />
        <label className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={search.lookingForPcs}
            onChange={(e) => setSearch((p) => ({ ...p, lookingForPcs: e.target.checked }))}
          />
          Looking for PCs only
        </label>
        <button type="button" onClick={() => void runSearch()} className="rounded bg-slate-900 px-3 py-2 text-white md:col-span-1">
          Search
        </button>
      </div>

      <div className="space-y-2">
        {searchable.map((listing) => (
          <article key={listing.id} className="rounded border border-[var(--border)] p-3">
            <p className="font-medium">{listing.displayName}</p>
            <p className="text-sm text-slate-400">
              {listing.classLevel} - {listing.city || ""} {listing.state || ""} {listing.country || ""} - @{listing.user.username}
            </p>
            <p className="text-sm text-slate-300">{listing.bio || listing.services || "No bio yet."}</p>
            <Link href={`/auditors/${listing.id}`} className="text-sm underline">
              View auditor profile
            </Link>
          </article>
        ))}
        {searchable.length === 0 ? <p className="text-sm text-slate-400">No auditor listings match your filters.</p> : null}
      </div>
    </section>
  );
}

