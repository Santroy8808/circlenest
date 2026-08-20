import Link from "next/link";
import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { getMarketplaceListingDetail } from "@/modules/marketplace/marketplace-search.service";

export default async function MarketplaceListingPage({ params }: { params: Promise<{ slug: string }> }) {
  const [session, { slug }] = await Promise.all([auth(), params]);
  const listing = await getMarketplaceListingDetail(slug, session?.user && !session.user.revoked ? session.user.id : null);
  if (!listing) notFound();
  return (
    <article>
      <Link href="/marketplace">Back to Marketplace</Link>
      <p>{listing.intent === "WANTED" ? "Wanted" : listing.kind}</p>
      <h1>{listing.title}</h1>
      <p>{listing.summary}</p>
      <p>{[listing.city, listing.region, listing.countryCode].filter(Boolean).join(", ") || (listing.remote ? "Remote" : "Location not listed")}</p>
      <div>{listing.description}</div>
      <aside>
        <h2>Published by {listing.publisher.name}</h2>
        {session?.user && !session.user.revoked
          ? <button type="button">Contact publisher</button>
          : <Link href={`/login?callbackUrl=${encodeURIComponent(`/marketplace/${listing.slug}`)}`}>Log in to contact</Link>}
      </aside>
    </article>
  );
}
