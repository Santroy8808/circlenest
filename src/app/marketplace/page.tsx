import Link from "next/link";

import { auth } from "@/auth";
import { searchMarketplaceListings } from "@/modules/marketplace/marketplace-search.service";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MarketplacePage({ searchParams }: { searchParams: SearchParams }) {
  const [session, params] = await Promise.all([auth(), searchParams]);
  const results = await searchMarketplaceListings({
    q: first(params.q),
    kind: first(params.kind),
    intent: first(params.intent),
    category: first(params.category),
    countryCode: first(params.country),
    region: first(params.region),
    city: first(params.city),
    remote: first(params.remote) === "true" ? true : undefined,
    sort: first(params.sort),
    cursor: first(params.cursor),
    limit: 24,
  });

  return (
    <section aria-labelledby="marketplace-title">
      <header>
        <p>Marketplace</p>
        <h1 id="marketplace-title">Find what you need. Offer what you have.</h1>
        <nav aria-label="Marketplace actions">
          {session?.user && !session.user.revoked ? <Link href="/marketplace/new">Create listing</Link> : <Link href="/login?callbackUrl=/marketplace/new">Log in to post</Link>}
          {session?.user && !session.user.revoked ? <Link href="/marketplace/manage">My listings</Link> : null}
        </nav>
      </header>
      <form action="/marketplace" role="search">
        <label htmlFor="marketplace-search">Search listings</label>
        <input defaultValue={first(params.q)} id="marketplace-search" name="q" placeholder="Jobs, rentals, services, items, auditors..." />
        <button type="submit">Search</button>
      </form>
      <div aria-live="polite">
        {results.items.length ? results.items.map((listing) => (
          <article key={listing.id}>
            <p>{listing.intent === "WANTED" ? "Wanted" : listing.kind}</p>
            <h2><Link href={`/marketplace/${listing.slug}`}>{listing.title}</Link></h2>
            <p>{listing.summary}</p>
            <p>{[listing.city, listing.region, listing.countryCode].filter(Boolean).join(", ") || (listing.remote ? "Remote" : "Location not listed")}</p>
          </article>
        )) : <p>No listings match this search yet.</p>}
      </div>
    </section>
  );
}
