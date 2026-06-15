"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
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
  imageUrls: string[];
  expiresAt: string;
  staleSoon: boolean;
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
  const router = useRouter();
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
    const response = await fetch(`/api/market?${params.toString()}`, { cache: "no-store" });
    const data = (await response.json().catch(() => [])) as Listing[];
    setListings(Array.isArray(data) ? data : []);
    setStatus("");
  }

  async function saveEdit(listingId: string) {
    await fetch(`/api/market/${listingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editTitle, price: Number(editPrice) }),
    });
    router.refresh();
  }

  async function renewListing(listingId: string) {
    await fetch(`/api/market/${listingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "RENEW" }),
    });
    router.refresh();
  }

  const cards: ReactNode[] = [];
  listings.forEach((listing, index) => {
    cards.push(
      <article key={listing.id} className="space-y-2">
        <div className="group relative aspect-square overflow-hidden rounded-[18px] border border-[var(--border)] bg-[#0d1320]">
          {listing.imageUrls[0] ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={listing.imageUrls[0]} alt={listing.title} className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]" />
              <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,transparent,rgba(6,9,16,0.92))] p-3">
                <p className="line-clamp-2 text-sm font-semibold text-white">{listing.title}</p>
                <p className="mt-1 text-sm font-semibold text-amber-200">${listing.price.toFixed(2)} {listing.currency}</p>
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col justify-end bg-[#111a2a] p-3">
              <p className="line-clamp-2 text-sm font-semibold text-white">{listing.title}</p>
              <p className="mt-1 text-sm font-semibold text-amber-200">${listing.price.toFixed(2)} {listing.currency}</p>
            </div>
          )}
          <div className="absolute right-2 top-2">
            <ReportControl
              targetType="MARKET_LISTING"
              targetId={listing.id}
              label="Report listing"
              compact
              triggerClassName="border-slate-400/30 bg-[#0f1728]/90 backdrop-blur"
            />
          </div>
        </div>
        {listing.staleSoon && listing.seller.id === currentUserId ? (
          <div className="mt-2 rounded border border-amber-400/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
            This listing is about to go stale. Renew it to keep it live.
            <button
              type="button"
              className="ml-2 rounded border border-amber-300/40 px-2 py-1 text-[11px] font-semibold text-amber-50"
              onClick={() => void renewListing(listing.id)}
            >
              Renew
            </button>
          </div>
        ) : null}
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
                      await fetch(`/api/market/${listing.id}`, { method: "DELETE" });
                      router.refresh();
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards}
        {!listings.length ? <p className="text-sm text-slate-500">No listings match current filters.</p> : null}
      </div>
    </section>
  );
}



