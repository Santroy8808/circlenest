"use client";

import Link from "next/link";
import { useState } from "react";
import { AdminObjectId } from "@/components/admin/admin-object-id";
import { ListingViewSwitcher } from "@/components/listings/listing-view-switcher";
import { MarketSellerMessageButton } from "@/components/market/market-seller-message-button";
import type { ListingViewMode } from "@/modules/listing-preferences/types";
import { marketCategoryOptions, type MarketCreateState, type MarketListingCardView } from "@/modules/market/types";
import { useRouter } from "next/navigation";

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
  initialView,
  isAdmin = false
}: {
  initialListings: MarketListingCardView[];
  createState: MarketCreateState;
  initialView: ListingViewMode;
  isAdmin?: boolean;
}) {
  const router = useRouter();
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

  function openListing(listing: MarketListingCardView) {
    router.push(`/market/${listing.slug}`);
  }

  function isQuickActionTarget(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest("a, button"));
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Member Marketplace</p>
            <h1 className="mt-3 text-3xl font-semibold">The Market</h1>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
              Find member listings, then open one for details and seller contact options.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="btn-secondary" href="/market/my-listings">
              My Listings
            </Link>
            {createState.viewerCanCreate ? (
              <Link className="btn-primary" href="/market/create">
                Create Listing
              </Link>
            ) : null}
          </div>
        </div>
        <div className="market-directory-controls mt-6 grid gap-3 xl:grid-cols-[1fr_260px_auto]">
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
          <p className="mt-2 text-[var(--muted)]">No listings match this view.</p>
        </section>
      ) : (
        <section className={`listing-grid listing-grid--${view}`}>
          {listings.map((listing) => (
            <article
              aria-label={`Open listing: ${listing.title}`}
              className={`listing-square-card listing-card--${view} market-card`}
              key={listing.id}
              onClick={(event) => {
                if (!isQuickActionTarget(event.target)) openListing(listing);
              }}
              onKeyDown={(event) => {
                if ((event.key === "Enter" || event.key === " ") && !isQuickActionTarget(event.target)) {
                  event.preventDefault();
                  openListing(listing);
                }
              }}
              role="link"
              tabIndex={0}
            >
              <div className="listing-square-visual">
                {listing.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" src={listing.thumbnailUrl} />
                ) : (
                  <span className="listing-square-fallback">{listing.categoryLabel}</span>
                )}
              </div>
              <span className="listing-square-top-badge">{priceLabel(listing)}</span>
              {listing.allowMessages ? (
                <div className="market-card-quick-action" onClick={(event) => event.stopPropagation()}>
                  <MarketSellerMessageButton compact sellerUserId={listing.seller.id} />
                </div>
              ) : null}
              <div className="listing-square-meta">
                <p className="listing-square-kicker">{listing.categoryLabel}</p>
                <h2>{listing.title}</h2>
                <p className="listing-square-subtitle">
                  By{" "}
                  <Link
                    className="profile-inline-link"
                    href={`/profile/${listing.seller.username}`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {listing.seller.displayName}
                  </Link>
                </p>
                <div className="listing-square-facts">
                  <span>{listing.location || "City TBD"}</span>
                  <strong>{priceLabel(listing)}</strong>
                </div>
                <AdminObjectId id={listing.id} kind="Listing" visible={isAdmin} />
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
