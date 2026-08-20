import Link from "next/link";
import { Bookmark, Building2, Grid3X3, List, Plus, Search, SlidersHorizontal } from "lucide-react";

import type { MarketplacePage } from "@/modules/marketplace/marketplace.contracts";
import type { MarketplaceListingCardView } from "@/modules/marketplace/marketplace-view";
import { MARKETPLACE_TEMPLATES } from "@/modules/marketplace/marketplace-templates";
import { MarketplaceCard } from "./marketplace-card";
import { MarketplaceCategoryTree } from "./marketplace-category-tree";
import styles from "./marketplace.module.css";

type DirectoryQuery = Record<string, string | undefined>;

function queryHref(query: DirectoryQuery, patch: DirectoryQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, ...patch })) {
    if (value) params.set(key, value);
  }
  return `/marketplace${params.size ? `?${params.toString()}` : ""}`;
}

export function MarketplaceDirectory({
  initialPage,
  query,
  signedIn,
}: {
  initialPage: MarketplacePage<MarketplaceListingCardView>;
  query: DirectoryQuery;
  signedIn: boolean;
}) {
  const compact = query.view === "compact";
  const selectedKind = query.kind && query.kind in MARKETPLACE_TEMPLATES ? query.kind as keyof typeof MARKETPLACE_TEMPLATES : null;
  const categories = selectedKind ? MARKETPLACE_TEMPLATES[selectedKind].categories : [];
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Theta-Space Marketplace</p>
          <h1>Find it. Offer it. Ask for it.</h1>
          <p className={styles.subhead}>Member-posted items, vehicles, rentals, services, jobs, and wanted requests in one searchable place.</p>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.secondaryButton} href="/auditors"><Building2 aria-hidden="true" />Church &amp; Auditor Directory</Link>
          {signedIn ? <Link className={styles.secondaryButton} href="/marketplace/saved"><Bookmark aria-hidden="true" />Saved</Link> : null}
          <Link className={styles.primaryButton} href={signedIn ? "/marketplace/new" : "/login?callbackUrl=/marketplace/new"}><Plus aria-hidden="true" />Post a listing</Link>
        </div>
      </header>

      <div className={styles.directoryLayout}>
        <MarketplaceCategoryTree query={query} />
        <div className={styles.directoryContent}>
          <section className={styles.searchBand} aria-label="Marketplace search">
            <form action="/marketplace" role="search">
              <div className={styles.searchRow}>
                <input aria-label="Search marketplace" className={styles.field} defaultValue={query.q} name="q" placeholder="What are you looking for?" />
                <select aria-label="Offer or wanted" className={styles.select} defaultValue={query.intent ?? ""} name="intent">
                  <option value="">Offers and wanted</option>
                  <option value="OFFER">Offers</option>
                  <option value="WANTED">Wanted</option>
                </select>
                <select aria-label="Sort listings" className={styles.select} defaultValue={query.sort ?? "newest"} name="sort">
                  <option value="newest">Newest</option>
                  <option value="relevance">Best match</option>
                  <option value="price_asc">Lowest price</option>
                  <option value="price_desc">Highest price</option>
                </select>
                <button className={styles.primaryButton} type="submit"><Search aria-hidden="true" />Search</button>
              </div>
              {query.kind ? <input name="kind" type="hidden" value={query.kind} /> : null}
              {query.view ? <input name="view" type="hidden" value={query.view} /> : null}
              <details className={styles.filterDetails}>
                <summary><SlidersHorizontal aria-hidden="true" />Location and price</summary>
                <div className={styles.filterGrid}>
                  <label className={styles.filterField}><span>Country code</span><input className={styles.field} defaultValue={query.country} maxLength={2} name="country" placeholder="US" /></label>
                  <label className={styles.filterField}><span>State / region</span><input className={styles.field} defaultValue={query.region} name="region" placeholder="Texas" /></label>
                  <label className={styles.filterField}><span>City</span><input className={styles.field} defaultValue={query.city} name="city" placeholder="Austin" /></label>
                  <label className={styles.filterField}><span>Category</span><select className={styles.select} defaultValue={query.category ?? ""} disabled={!selectedKind} name="category"><option value="">{selectedKind ? `All ${MARKETPLACE_TEMPLATES[selectedKind].label.toLowerCase()}` : "Choose a listing type first"}</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
                  <label className={styles.filterField}><span>Work or service mode</span><select className={styles.select} defaultValue={query.remote ?? ""} name="remote"><option value="">Any</option><option value="true">Remote available</option><option value="false">Local only</option></select></label>
                  <label className={styles.filterField}><span>Minimum price</span><input className={styles.field} defaultValue={query.min} inputMode="decimal" min="0" name="min" placeholder="0" type="number" /></label>
                  <label className={styles.filterField}><span>Maximum price</span><input className={styles.field} defaultValue={query.max} inputMode="decimal" min="0" name="max" placeholder="Any" type="number" /></label>
                  <div className={styles.filterActions}><button className={styles.secondaryButton} type="submit">Apply filters</button><Link className={styles.secondaryButton} href="/marketplace">Clear</Link></div>
                </div>
              </details>
            </form>
          </section>

          <div className={styles.resultsHeader}>
            <p>{initialPage.items.length ? `${initialPage.items.length} listings shown` : "No matches"}</p>
            <div className={styles.viewActions} role="group" aria-label="Listing view">
              <Link aria-label="Grid view" className={!compact ? styles.iconButton : styles.secondaryButton} data-tooltip="Grid view." href={queryHref(query, { view: undefined, cursor: undefined })}><Grid3X3 aria-hidden="true" /></Link>
              <Link aria-label="Compact view" className={compact ? styles.iconButton : styles.secondaryButton} data-tooltip="Compact view." href={queryHref(query, { view: "compact", cursor: undefined })}><List aria-hidden="true" /></Link>
            </div>
          </div>

          {initialPage.items.length ? (
            <div className={`${styles.cardGrid} ${compact ? styles.compactGrid : ""}`}>
              {initialPage.items.map((listing) => <MarketplaceCard compact={compact} key={listing.id} listing={listing} />)}
            </div>
          ) : (
            <div className={styles.emptyState}><div><Search aria-hidden="true" /><h2>No matching listings</h2><p>Try a wider location, fewer filters, or post what you need as a wanted listing.</p><Link className={styles.primaryButton} href={signedIn ? "/marketplace/new?intent=WANTED" : "/login?callbackUrl=/marketplace/new?intent=WANTED"}>Post what you need</Link></div></div>
          )}

          {initialPage.nextCursor ? (
            <div className={styles.loadMore}><Link className={styles.secondaryButton} href={queryHref(query, { cursor: initialPage.nextCursor })}>Load more listings</Link></div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
