import Link from "next/link";
import type { MarketCreateState, MarketListingCardView } from "@/modules/market/types";

export function MyMarketListings({
  listings,
  createState
}: {
  listings: MarketListingCardView[];
  createState: MarketCreateState;
}) {
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
          <div className="market-management-list">
            {listings.map((listing) => (
              <article className="market-management-row" key={listing.id}>
                <Link className="min-w-0 flex-1" href={`/market/${listing.slug}`}>
                  <strong>{listing.title}</strong>
                  <small>
                    {listing.categoryLabel} · {listing.location || "City TBD"}
                  </small>
                </Link>
                <Link className="market-management-row-action" href={`/market/${listing.slug}/edit`}>
                  Edit
                </Link>
              </article>
            ))}
          </div>
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
