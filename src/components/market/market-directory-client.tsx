"use client";

import Link from "next/link";
import { useState } from "react";
import { marketCategoryOptions, type MarketCreateState, type MarketListingCardView } from "@/modules/market/types";

function priceLabel(listing: Pick<MarketListingCardView, "priceCents" | "currency">) {
  if (listing.priceCents === null || listing.priceCents === undefined) return "Contact";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: listing.currency
  }).format(listing.priceCents / 100);
}

export function MarketDirectoryClient({
  initialListings,
  createState
}: {
  initialListings: MarketListingCardView[];
  createState: MarketCreateState;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const listings = initialListings.filter((listing) => {
    const matchesQuery = [listing.title, listing.categoryLabel, listing.seller.displayName].join(" ").toLowerCase().includes(query.trim().toLowerCase());
    const matchesCategory = category ? listing.category === category : true;
    return matchesQuery && matchesCategory;
  });

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Production Zone</p>
            <h1 className="mt-3 text-3xl font-semibold">The Market</h1>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
              Browse member listings as thumbnails first. Open a card for the full description and seller details.
            </p>
            {createState.viewerCanCreate && createState.listingLimit !== null ? (
              <p className="mt-3 text-sm text-[var(--gold)]">
                {createState.listingsRemaining} of {createState.listingLimit} Contributor listings left this 14-day period.
              </p>
            ) : null}
            {createState.viewerCanCreate && createState.storefrontEligible ? (
              <p className="mt-2 text-sm text-[var(--muted)]">Professional storefront support is reserved for the Business Storefront phase.</p>
            ) : null}
          </div>
          {createState.viewerCanCreate ? (
            <Link className="btn-primary" href="/market/create">
              Create Listing
            </Link>
          ) : null}
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-[1fr_260px]">
          <input className="form-field" onChange={(event) => setQuery(event.target.value)} placeholder="Search The Market..." value={query} />
          <select className="form-field" onChange={(event) => setCategory(event.target.value)} value={category}>
            <option value="">All categories</option>
            {marketCategoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {listings.length === 0 ? (
        <section className="surface rounded-md p-8 text-center">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">No listings yet</h2>
          <p className="mt-2 text-[var(--muted)]">Listings will appear here as clean thumbnails with title and price.</p>
        </section>
      ) : (
        <section className="market-grid">
          {listings.map((listing) => (
            <Link className="market-card" href={`/market/${listing.slug}`} key={listing.id}>
              <div className="market-thumb">
                {listing.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" src={listing.thumbnailUrl} />
                ) : (
                  <span>{listing.categoryLabel}</span>
                )}
              </div>
              <div className="market-card-meta">
                <h2 className="truncate text-lg font-semibold">{listing.title}</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">{listing.categoryLabel}</p>
                <p className="mt-3 text-xl font-black text-[var(--gold)]">{priceLabel(listing)}</p>
              </div>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
