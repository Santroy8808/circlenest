import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive, BriefcaseBusiness, Store } from "lucide-react";

import { auth } from "@/auth";
import { listLegacyMarketplaceArchive } from "@/modules/marketplace/marketplace-search.service";
import styles from "@/components/marketplace/marketplace.module.css";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function LegacyMarketplacePage() {
  const session = await auth();
  if (!session?.user || session.user.revoked) redirect("/login?callbackUrl=/marketplace/legacy");
  const archive = await listLegacyMarketplaceArchive(session.user.id, session.user.role);
  return <div className={styles.page}>
    <header className={styles.pageHeader}><div><p className={styles.eyebrow}>Read-only history</p><h1>Legacy listing archive</h1><p className={styles.subhead}>Listings created before the unified marketplace are preserved here. Create a new listing to publish into current search.</p></div><Link className={styles.primaryButton} href="/marketplace/new">Create current listing</Link></header>
    <section className={styles.archiveSection}>
      <header className={styles.savedSectionHeader}><div><p className={styles.sectionLabel}>Previous Market</p><h2>Items and rentals</h2></div><span>{archive.market.length}</span></header>
      {archive.market.length ? <div className={styles.archiveList}>{archive.market.map((listing) => <article key={listing.id}><Store aria-hidden="true" /><div><p className={styles.sectionLabel}>{String(listing.category).replace(/_/g, " ")} · {listing.status}</p><h3><Link href={`/market/${listing.slug}`}>{listing.title}</Link></h3><p>{listing.location || "Location not provided"} · {listing.priceCents == null ? "Contact for price" : new Intl.NumberFormat("en-US", { style: "currency", currency: listing.currency }).format(listing.priceCents / 100)} · {new Date(listing.createdAt).toLocaleDateString()}</p></div></article>)}</div> : <div className={styles.savedEmpty}>No previous Market records.</div>}
    </section>
    <section className={styles.archiveSection}>
      <header className={styles.savedSectionHeader}><div><p className={styles.sectionLabel}>Previous Jobs</p><h2>Job postings</h2></div><span>{archive.jobs.length}</span></header>
      {archive.jobs.length ? <div className={styles.archiveList}>{archive.jobs.map((listing) => <article key={listing.id}><BriefcaseBusiness aria-hidden="true" /><div><p className={styles.sectionLabel}>{String(listing.category).replace(/_/g, " ")} · {listing.status}</p><h3><Link href={`/jobs/${listing.slug}`}>{listing.title}</Link></h3><p>{listing.companyName || "Company not provided"} · {listing.location || (listing.remote ? "Remote" : "Location not provided")} · {new Date(listing.createdAt).toLocaleDateString()}</p></div></article>)}</div> : <div className={styles.savedEmpty}>No previous Job records.</div>}
    </section>
    {!archive.market.length && !archive.jobs.length ? <div className={styles.emptyState}><div><Archive aria-hidden="true" /><h2>No legacy listings</h2><p>Your new marketplace listings are managed separately.</p></div></div> : null}
  </div>;
}
