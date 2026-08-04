"use client";

import Link from "next/link";
import { useState } from "react";
import type { MarketCreateState, MarketListingCardView } from "@/modules/market/types";

type MyMarketListingView = "grid" | "compact";

function priceLabel(listing: Pick<MarketListingCardView, "priceCents" | "currency" | "category">) {
  if (listing.priceCents === null || listing.priceCents === undefined) return "Contact";
  const label = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: listing.currency
  }).format(listing.priceCents / 100);
  return listing.category === "RENTALS" ? `${label}/mo` : label;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function statusLabel(listing: MarketListingCardView) {
  if (listing.status === "ACTIVE" && listing.expiresAt && new Date(listing.expiresAt) <= new Date()) return "Expired";
  return listing.status.toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
}

function secondaryLine(listing: MarketListingCardView) {
  if (listing.category === "RENTALS") {
    const beds = listing.rentalBedrooms ?? "?";
    const baths = listing.rentalBathrooms ?? "?";
    return `${beds} bd / ${baths} ba - ${listing.location || "City TBD"}`;
  }

  return `${listing.categoryLabel} - ${listing.location || "City TBD"}`;
}

export function MyMarketListings({
  listings,
  createState
}: {
  listings: MarketListingCardView[];
  createState: MarketCreateState;
}) {
  const [view, setView] = useState<MyMarketListingView>("compact");

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Seller Tools</p>
            <h1 className="mt-3 text-3xl font-semibold">My Listings</h1>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
              Review the listings you created. Choose Edit to update a listing.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="btn-secondary" href="/market">
              Back to Market
            </Link>
            {createState.viewerCanCreate ? (
              <Link className="btn-primary" href="/market/create">
                Create Listing
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {listings.length > 0 ? (
        <section className="surface rounded-md p-6">
          <div className="listing-toolbar mb-4">
            <p className="text-sm text-[var(--muted)]">
              {listings.length} {listings.length === 1 ? "listing" : "listings"} shown.
            </p>
            <div aria-label="My listings view" className="listing-view-switcher" role="group">
              <span className="listing-view-switcher-label">View</span>
              {(["compact", "grid"] as const).map((mode) => (
                <button
                  aria-pressed={view === mode}
                  className={view === mode ? "listing-view-option is-active" : "listing-view-option"}
                  key={mode}
                  onClick={() => setView(mode)}
                  type="button"
                >
                  {mode === "grid" ? "Grid" : "Compact"}
                </button>
              ))}
            </div>
          </div>

          {view === "grid" ? (
            <div className="market-management-grid">
              {listings.map((listing) => (
                <article className="market-management-card" key={listing.id}>
                  <Link className="market-management-card-visual" href={`/market/${listing.slug}`}>
                    {listing.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt="" src={listing.thumbnailUrl} />
                    ) : (
                      <span>{listing.categoryLabel}</span>
                    )}
                  </Link>
                  <div className="market-management-card-body">
                    <div className="market-management-card-heading">
                      <span>{statusLabel(listing)}</span>
                      <strong>{priceLabel(listing)}</strong>
                    </div>
                    <Link className="market-management-title" href={`/market/${listing.slug}`}>
                      {listing.title}
                    </Link>
                    <p>{secondaryLine(listing)}</p>
                    <small>
                      Listed {dateLabel(listing.createdAt)}
                      {listing.expiresAt ? ` - Expires ${dateLabel(listing.expiresAt)}` : ""}
                    </small>
                    <Link className="market-management-row-action" href={`/market/${listing.slug}/edit`}>
                      Edit
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="market-management-list">
              {listings.map((listing) => (
                <article className="market-management-row market-management-row--rich" key={listing.id}>
                  <Link className="market-management-row-main" href={`/market/${listing.slug}`}>
                    <span className="market-management-thumbnail">
                      {listing.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt="" src={listing.thumbnailUrl} />
                      ) : (
                        <span>{listing.categoryLabel}</span>
                      )}
                    </span>
                    <span className="market-management-row-copy">
                      <strong>{listing.title}</strong>
                      <small>{secondaryLine(listing)}</small>
                    </span>
                  </Link>
                  <div className="market-management-row-data" aria-label={`Listing details for ${listing.title}`}>
                    <span>{priceLabel(listing)}</span>
                    <span>Listed {dateLabel(listing.createdAt)}</span>
                    <span>{statusLabel(listing)}</span>
                  </div>
                  <Link className="market-management-row-action" href={`/market/${listing.slug}/edit`}>
                    Edit
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="surface rounded-md p-8 text-center">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">No listings yet</h2>
          <p className="mt-2 text-[var(--muted)]">Create your first listing when you are ready to sell or offer a service.</p>
          {createState.viewerCanCreate ? (
            <Link className="btn-primary mt-5 inline-flex" href="/market/create">
              Create Listing
            </Link>
          ) : null}
        </section>
      )}
    </div>
  );
}
