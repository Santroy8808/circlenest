import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { listOwnedMarketplaceListings } from "@/modules/marketplace/marketplace-search.service";

export default async function ManageMarketplaceListingsPage() {
  const session = await auth();
  if (!session?.user || session.user.revoked) redirect("/login?callbackUrl=/marketplace/manage");
  const listings = await listOwnedMarketplaceListings(session.user.id);
  return (
    <section>
      <header><h1>My listings</h1><Link href="/marketplace/new">Create listing</Link></header>
      {listings.length ? listings.map((listing) => (
        <article key={listing.id}>
          <h2><Link href={`/marketplace/${listing.slug}`}>{listing.title}</Link></h2>
          <p>{listing.status}</p>
        </article>
      )) : <p>You have not created a marketplace listing yet.</p>}
    </section>
  );
}
