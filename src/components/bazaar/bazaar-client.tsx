"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AdPlacementCard } from "@/components/ads/ad-placement-card";
import { ReportControl } from "@/components/reports/report-control";
import { pickRotatingAd, resolveAdRotationSeed } from "@/lib/ads/ad-selection";

type Listing = {
  id: string;
  title: string;
  description: string | null;
  price: number;
  currency: string;
  location: string | null;
  category: string | null;
  seller: { id: string; username: string };
    ads: {
      id: string;
      headline: string;
      body: string | null;
      creditCost: number;
      boostFactor: number;
      status: string;
      startsAt: string;
      endsAt: string | null;
      createdAt: string;
      creator: { id: string; username: string };
    }[];
  };

type BazaarClientProps = {
  initialListings: Listing[];
  currentUserId: string;
};

export function BazaarClient({ initialListings, currentUserId }: BazaarClientProps) {
  const [listings, setListings] = useState<Listing[]>(initialListings);
  const [q, setQ] = useState("");
  const [location, setLocation] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [status, setStatus] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const adSeed = useMemo(() => resolveAdRotationSeed(), []);
  const adPool = useMemo(() => listings.flatMap((listing) => listing.ads), [listings]);

  async function search() {
    setStatus("Searching...");
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (location.trim()) params.set("location", location.trim());
    if (minPrice.trim()) params.set("minPrice", minPrice.trim());
    if (maxPrice.trim()) params.set("maxPrice", maxPrice.trim());
    const response = await fetch(`/api/bazaar?${params.toString()}`, { cache: "no-store" });
    const data = (await response.json().catch(() => [])) as Listing[];
    setListings(Array.isArray(data) ? data : []);
    setStatus("");
  }

  async function saveEdit(listingId: string) {
    await fetch(`/api/bazaar/${listingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editTitle, price: Number(editPrice) }),
    });
    window.location.reload();
  }

  const cards: ReactNode[] = [];
  listings.forEach((listing, index) => {
    cards.push(
      <article key={listing.id} className="flex h-full flex-col rounded border border-[var(--border)] bg-[#0d1320] p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-lg font-semibold text-[var(--text-strong)]">{listing.title}</p>
            <p className="text-sm text-slate-300">{listing.description || "No description provided."}</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="rounded-full border border-slate-400/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-300">
              {listing.category || "Uncategorized"}
            </span>
            <ReportControl
              targetType="BAZAAR_LISTING"
              targetId={listing.id}
              label="Report listing"
              compact
              triggerClassName="border-slate-400/30 bg-[#0f1728]"
            />
          </div>
        </div>
        <p className="mt-2 text-sm text-slate-200">
          ${listing.price.toFixed(2)} {listing.currency}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {listing.location || "No location"} | @{listing.seller.username}
        </p>
        {listing.seller.id === currentUserId ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {editId === listing.id ? (
              <>
                <input
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  className="rounded border px-2 py-1 text-xs"
                  placeholder="Title"
                />
                <input
                  value={editPrice}
                  onChange={(event) => setEditPrice(event.target.value)}
                  className="w-24 rounded border px-2 py-1 text-xs"
                  placeholder="Price"
                />
                <button className="rounded border px-2 py-1 text-xs" onClick={() => void saveEdit(listing.id)}>
                  Save
                </button>
                <button className="rounded border px-2 py-1 text-xs" onClick={() => setEditId(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  className="rounded border px-2 py-1 text-xs"
                  onClick={() => {
                    setEditId(listing.id);
                    setEditTitle(listing.title);
                    setEditPrice(String(listing.price));
                  }}
                >
                  Edit
                </button>
                <button
                  className="rounded border border-red-400 px-2 py-1 text-xs text-red-300"
                  onClick={async () => {
                    await fetch(`/api/bazaar/${listing.id}`, { method: "DELETE" });
                    window.location.reload();
                  }}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        ) : null}
      </article>,
    );

    if ((index + 1) % 6 === 0) {
      cards.push(
          <AdPlacementCard
          key={`ad-${listing.id}`}
          ad={pickRotatingAd(adPool, Math.floor(index / 6), adSeed)}
          targetLabel="market"
        />,
      );
    }
  });

  return (
    <section className="space-y-4">
      <div className="grid gap-2 md:grid-cols-4">
        <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Title or keyword" className="rounded border border-slate-300 px-3 py-2 text-sm" />
        <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Location" className="rounded border border-slate-300 px-3 py-2 text-sm" />
        <input value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder="Min price" className="rounded border border-slate-300 px-3 py-2 text-sm" />
        <input value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="Max price" className="rounded border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <button className="rounded border border-slate-300 px-3 py-2 text-sm" onClick={() => void search()}>
        Search Listings
      </button>
      {status ? <p className="text-xs text-slate-500">{status}</p> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards}
        {!listings.length ? <p className="text-sm text-slate-500">No listings match current filters.</p> : null}
      </div>
    </section>
  );
}



