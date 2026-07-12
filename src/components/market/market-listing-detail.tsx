import { AdDestinationKind, InterestCategory } from "@prisma/client";
import Link from "next/link";
import { AdminObjectId } from "@/components/admin/admin-object-id";
import { InAppImageViewer } from "@/components/media/in-app-image-viewer";
import { MarketSellerMessageButton } from "@/components/market/market-seller-message-button";
import { MarkdownRichText } from "@/components/rich-text/markdown-rich-text";
import type { MarketListingDetailView } from "@/modules/market/types";

function priceLabel(listing: Pick<MarketListingDetailView, "priceCents" | "currency">) {
  if (listing.priceCents === null || listing.priceCents === undefined) return "Contact seller";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: listing.currency
  }).format(listing.priceCents / 100);
}

export function MarketListingDetail({ isAdmin = false, listing }: { isAdmin?: boolean; listing: MarketListingDetailView }) {
  return (
    <div className="grid gap-5">
      <section className="surface overflow-hidden rounded-md">
        <div
          aria-label="Listing photos"
          className="grid min-h-[180px] items-center justify-center gap-4 overflow-hidden bg-[#172133] p-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),420px))]"
        >
          {listing.photos.length > 0 ? (
            listing.photos.map((photo) =>
              photo.publicUrl ? (
                <InAppImageViewer
                  alt={photo.originalName ?? listing.title}
                  className="market-detail-image-trigger !h-auto !w-full aspect-[4/3] max-h-[360px] max-w-[420px]"
                  key={photo.id}
                  src={photo.publicUrl}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="" className="h-full w-full object-contain" src={photo.publicUrl} />
                </InAppImageViewer>
              ) : null
            )
          ) : (
            <span>{listing.categoryLabel}</span>
          )}
        </div>
        <div className="market-detail-content p-6">
          <div className="market-detail-main">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">{listing.categoryLabel}</p>
                <h1 className="mt-3 text-4xl font-semibold">{listing.title}</h1>
                <div className="mt-3">
                  <AdminObjectId id={listing.id} kind="Listing" visible={isAdmin} />
                </div>
                <p className="mt-3 text-3xl font-black text-[var(--gold)]">{priceLabel(listing)}</p>
                <p className="mt-3 text-[var(--muted)]">{listing.location || "City TBD"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {listing.viewerCanManage ? (
                  <Link className="btn-secondary" href={`/market/${listing.slug}/edit`}>
                    Edit listing
                  </Link>
                ) : null}
                <Link className="btn-secondary" href="/market">
                  Back to Market
                </Link>
              </div>
            </div>
            <MarkdownRichText className="market-listing-description mt-6" value={listing.description} />
          </div>
          <aside className="market-listing-owner-contact">
            <h2 className="text-xl font-semibold text-[var(--gold)]">{listing.viewerCanManage ? "Contact details" : "Seller"}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              {listing.viewerCanManage ? "Only you can see the contact details saved for this listing." : "Contact this seller through Theta-Space."}
            </p>
            <div className="market-contact-seller mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gold)]">Seller</p>
              <Link className="profile-inline-link mt-2 block" href={`/profile/${listing.seller.username}`}>
                {listing.seller.displayName}
              </Link>
              <Link className="profile-inline-link mt-1 block text-sm" href={`/profile/${listing.seller.username}`}>
                @{listing.seller.username}
              </Link>
            </div>
            {listing.viewerCanManage ? (
              <div className="market-contact-card mt-4">
                {listing.contactEmail ? (
                  <a className="market-contact-line" href={`mailto:${listing.contactEmail}?subject=${encodeURIComponent(`Theta-Space Market: ${listing.title}`)}`}>
                    Email: {listing.contactEmail}
                  </a>
                ) : null}
                {listing.contactPhone ? <p className="market-contact-line">Phone: {listing.contactPhone}</p> : null}
                {listing.contactNotes ? <p className="market-contact-line">{listing.contactNotes}</p> : null}
                {!listing.contactEmail && !listing.contactPhone && !listing.contactNotes ? (
                  <p className="market-contact-line">No contact details added.</p>
                ) : null}
              </div>
            ) : listing.allowMessages ? (
              <div className="mt-4">
                <MarketSellerMessageButton sellerUserId={listing.seller.id} />
              </div>
            ) : null}
          </aside>
        </div>
      </section>

      {listing.viewerCanPromote ? (
        <section className="surface rounded-md p-5">
          <h2 className="text-xl font-semibold text-[var(--gold)]">Promotion</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Promoting a listing creates a normal ad campaign. Ads do not appear inside this listing page.
          </p>
          <Link
            className="btn-secondary mt-4 inline-block"
            href={`/ads/create?destinationKind=${AdDestinationKind.MARKET_LISTING}&marketListingId=${listing.id}&title=${encodeURIComponent(`Promote ${listing.title}`)}&body=${encodeURIComponent(listing.description.slice(0, 220) || `View ${listing.title} in The Market.`)}&targetInterestCategories=${InterestCategory.MARKET}`}
          >
            Create listing ad
          </Link>
        </section>
      ) : null}
    </div>
  );
}
