import { AdDestinationKind, InterestCategory } from "@prisma/client";
import Link from "next/link";
import { AdminObjectId } from "@/components/admin/admin-object-id";
import { InAppImageViewer } from "@/components/media/in-app-image-viewer";
import type { MarketListingDetailView } from "@/modules/market/types";

function priceLabel(listing: Pick<MarketListingDetailView, "priceCents" | "currency">) {
  if (listing.priceCents === null || listing.priceCents === undefined) return "Contact seller";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: listing.currency
  }).format(listing.priceCents / 100);
}

export function MarketListingDetail({ isAdmin = false, listing }: { isAdmin?: boolean; listing: MarketListingDetailView }) {
  const hero = listing.photos[0];

  return (
    <div className="grid gap-5">
      <section className="surface overflow-hidden rounded-md">
        <div className="market-detail-hero">
          {hero?.publicUrl ? (
            <InAppImageViewer alt={hero.originalName ?? listing.title} className="market-detail-image-trigger" src={hero.publicUrl}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" src={hero.publicUrl} />
            </InAppImageViewer>
          ) : (
            <span>{listing.categoryLabel}</span>
          )}
        </div>
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">{listing.categoryLabel}</p>
              <h1 className="mt-3 text-4xl font-semibold">{listing.title}</h1>
              <div className="mt-3">
                <AdminObjectId id={listing.id} kind="Listing" visible={isAdmin} />
              </div>
              <p className="mt-3 text-3xl font-black text-[var(--gold)]">{priceLabel(listing)}</p>
              <p className="mt-3 text-[var(--muted)]">{listing.location || "Location TBD"}</p>
            </div>
            <Link className="btn-secondary" href="/market">
              Back to Market
            </Link>
          </div>
          <p className="mt-6 whitespace-pre-wrap leading-7 text-[var(--muted)]">{listing.description}</p>
        </div>
      </section>

      {listing.photos.length > 1 ? (
        <section className="surface rounded-md p-5">
          <h2 className="text-xl font-semibold text-[var(--gold)]">Photos</h2>
          <div className="gallery-grid mt-4">
            {listing.photos.map((photo) => (
              <div className="gallery-tile" key={photo.id}>
                {photo.publicUrl ? (
                  <InAppImageViewer alt={photo.originalName ?? listing.title} className="gallery-tile-image-trigger" src={photo.publicUrl}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="" src={photo.publicUrl} />
                  </InAppImageViewer>
                ) : (
                  <span className="gallery-tile-fallback">{photo.originalName ?? "Photo"}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="surface rounded-md p-5">
          <h2 className="text-xl font-semibold text-[var(--gold)]">Seller</h2>
          <Link className="profile-inline-link mt-2 block" href={`/profile/${listing.seller.username}`}>
            {listing.seller.displayName}
          </Link>
          <Link className="profile-inline-link mt-1 block text-sm" href={`/profile/${listing.seller.username}`}>
            @{listing.seller.username}
          </Link>
          <Link className="btn-secondary mt-4 inline-block" href="/mail">
            Open Mail
          </Link>
        </article>
        <article className="surface rounded-md p-5">
          <h2 className="text-xl font-semibold text-[var(--gold)]">Promotion</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Promoting a listing creates a normal ad campaign. Ads do not appear inside this listing page.
          </p>
          {listing.viewerCanPromote ? (
            <Link
              className="btn-secondary mt-4 inline-block"
              href={`/ads/create?destinationKind=${AdDestinationKind.MARKET_LISTING}&marketListingId=${listing.id}&title=${encodeURIComponent(`Promote ${listing.title}`)}&body=${encodeURIComponent(listing.description.slice(0, 220) || `View ${listing.title} in The Market.`)}&targetInterestCategories=${InterestCategory.MARKET}`}
            >
              Create listing ad
            </Link>
          ) : null}
        </article>
      </section>
    </div>
  );
}
