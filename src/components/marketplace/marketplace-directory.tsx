import Link from "next/link";
import { Bookmark, Building2, Grid3X3, List, Plus, Search, SlidersHorizontal } from "lucide-react";

import type { MarketplacePage } from "@/modules/marketplace/marketplace.contracts";
import type { MarketplaceAvailableCategory } from "@/modules/marketplace/marketplace-navigation";
import type { MarketplaceListingCardView } from "@/modules/marketplace/marketplace-view";
import { MARKETPLACE_TEMPLATES } from "@/modules/marketplace/marketplace-templates";
import { MarketplaceCard } from "./marketplace-card";
import { MarketplaceCategoryTree } from "./marketplace-category-tree";
import { MarketplaceSearchToolbar } from "./marketplace-search-toolbar";
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
  availableCategories,
  initialPage,
  query,
  signedIn,
}: {
  availableCategories: MarketplaceAvailableCategory[];
  initialPage: MarketplacePage<MarketplaceListingCardView>;
  query: DirectoryQuery;
  signedIn: boolean;
}) {
  const compact = query.view === "compact";
  const selectedKind = query.kind && query.kind in MARKETPLACE_TEMPLATES ? query.kind as keyof typeof MARKETPLACE_TEMPLATES : null;
  const categories = selectedKind ? MARKETPLACE_TEMPLATES[selectedKind].categories : [];
  const hasActiveSearch = Boolean(query.q || query.kind || query.intent || query.category || query.country || query.region || query.city || query.remote || query.min || query.max);
  const resultsLabel = initialPage.items.length
    ? hasActiveSearch ? `${initialPage.items.length} results` : "Newest listings"
    : hasActiveSearch ? "No matches" : "Newest listings";
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Theta-Space</p>
          <h1>Marketplace</h1>
          <p className={styles.subhead}>Find it, offer it, or post what you need.</p>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.secondaryButton} href="/auditors"><Building2 aria-hidden="true" />Church &amp; Auditor Directory</Link>
          {signedIn ? <Link className={styles.secondaryButton} href="/marketplace/saved"><Bookmark aria-hidden="true" />Saved</Link> : null}
          <Link className={styles.primaryButton} href={signedIn ? "/marketplace/new" : "/login?callbackUrl=/marketplace/new"}><Plus aria-hidden="true" />Post a listing</Link>
        </div>
      </header>

      <section className={styles.searchBand} aria-label="Marketplace search">
        <MarketplaceSearchToolbar query={query} />
        <form action="/marketplace" className={styles.advancedFilterForm}>
          {query.q ? <input name="q" type="hidden" value={query.q} /> : null}
          {query.kind ? <input name="kind" type="hidden" value={query.kind} /> : null}
          {query.intent ? <input name="intent" type="hidden" value={query.intent} /> : null}
          {query.sort ? <input name="sort" type="hidden" value={query.sort} /> : null}
          {query.view ? <input name="view" type="hidden" value={query.view} /> : null}
          <details className={styles.filterDetails}>
            <summary><SlidersHorizontal aria-hidden="true" />More filters</summary>
            <div className={styles.filterGrid}>
              <label className={styles.filterField}><span>Country code</span><input className={styles.field} defaultValue={query.country} maxLength={2} name="country" placeholder="US" /></label>
              <label className={styles.filterField}><span>State / region</span><input className={styles.field} defaultValue={query.region} name="region" placeholder="Texas" /></label>
              <label className={styles.filterField}><span>City</span><input className={styles.field} defaultValue={query.city} name="city" placeholder="Austin" /></label>
              <label className={styles.filterField}><span>Category</span><select className={styles.select} defaultValue={query.category ?? ""} disabled={!selectedKind} name="category"><option value="">{selectedKind ? `All ${MARKETPLACE_TEMPLATES[selectedKind].label.toLowerCase()}` : "Choose a category from Browse"}</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
              <label className={styles.filterField}><span>Availability</span><select className={styles.select} defaultValue={query.remote ?? ""} name="remote"><option value="">Local and remote</option><option value="true">Remote available</option><option value="false">Local only</option></select></label>
              <label className={styles.filterField}><span>Minimum price</span><input className={styles.field} defaultValue={query.min} inputMode="decimal" min="0" name="min" placeholder="0" type="number" /></label>
              <label className={styles.filterField}><span>Maximum price</span><input className={styles.field} defaultValue={query.max} inputMode="decimal" min="0" name="max" placeholder="Any" type="number" /></label>
              <div className={styles.filterActions}><button className={styles.secondaryButton} type="submit">Apply filters</button><Link className={styles.secondaryButton} href="/marketplace">Clear all</Link></div>
            </div>
          </details>
        </form>
      </section>

      <div className={styles.directoryLayout}>
        <MarketplaceCategoryTree availableCategories={availableCategories} query={query} />
        <div className={styles.directoryContent}>
          <div className={styles.resultsHeader}>
            <p>{resultsLabel}</p>
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
