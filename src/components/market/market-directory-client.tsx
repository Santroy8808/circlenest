"use client";

import Link from "next/link";
import { useState } from "react";
import { ListingViewSwitcher } from "@/components/listings/listing-view-switcher";
import type { ListingViewMode } from "@/modules/listing-preferences/types";
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
  createState,
  initialView
}: {
  initialListings: MarketListingCardView[];
  createState: MarketCreateState;
  initialView: ListingViewMode;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [view, setView] = useState<ListingViewMode>(initialView);
  const listings = initialListings.filter((listing) => {
    const matchesQuery = [listing.title, listing.categoryLabel, listing.location, listing.seller.displayName]
      .join(" ")
      .toLowerCase()
      .includes(query.trim().toLowerCase());
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
        <div className="mt-6 grid gap-3 xl:grid-cols-[1fr_260px_auto]">
          <input className="form-field" onChange={(event) => setQuery(event.target.value)} placeholder="Search The Market..." value={query} />
          <select className="form-field" onChange={(event) => setCategory(event.target.value)} value={category}>
            <option value="">All categories</option>
            {marketCategoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ListingViewSwitcher onChange={setView} surface="market" value={view} />
        </div>
      </section>

      {listings.length === 0 ? (
        <section className="surface rounded-md p-8 text-center">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">No listings yet</h2>
          <p className="mt-2 text-[var(--muted)]">Listings will appear here as clean thumbnails with title and price.</p>
        </section>
      ) : (
        <section className={`listing-grid listing-grid--${view}`}>
          {listings.map((listing) => (
            <Link className={`listing-square-card listing-card--${view} market-card`} href={`/market/${listing.slug}`} key={listing.id}>
              <div className="listing-square-visual">
                {listing.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" src={listing.thumbnailUrl} />
                ) : (
                  <span className="listing-square-fallback">{listing.categoryLabel}</span>
                )}
              </div>
              <span className="listing-square-top-badge">{priceLabel(listing)}</span>
              <div className="listing-square-meta">
                <p className="listing-square-kicker">{listing.categoryLabel}</p>
                <h2>{listing.title}</h2>
                <p className="listing-square-subtitle">By {listing.seller.displayName}</p>
                <div className="listing-square-facts">
                  <span>{listing.location || "Location TBD"}</span>
                  <strong>{priceLabel(listing)}</strong>
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
