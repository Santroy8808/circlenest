import Link from "next/link";
import { BriefcaseBusiness, ChevronRight, FolderSearch2, Search, ShoppingBag, Wrench } from "lucide-react";

import {
  MARKETPLACE_NAVIGATION,
  type MarketplaceNavigationItem,
  type MarketplaceNavigationQuery,
} from "@/modules/marketplace/marketplace-navigation";
import styles from "./marketplace.module.css";

type DirectoryQuery = Record<string, string | undefined>;

const sectionIcons = {
  buy: ShoppingBag,
  services: Wrench,
  rentals: FolderSearch2,
  find: Search,
  business: BriefcaseBusiness,
} as const;

function matches(item: MarketplaceNavigationItem, query: DirectoryQuery) {
  if (!item.query) return false;
  return Object.entries(item.query).every(([key, value]) => query[key] === value);
}

function hasActiveChild(item: MarketplaceNavigationItem, query: DirectoryQuery): boolean {
  return matches(item, query) || Boolean(item.children?.some((child) => hasActiveChild(child, query)));
}

function hrefFor(query: DirectoryQuery, item: MarketplaceNavigationItem) {
  if (item.href) return item.href;
  const params = new URLSearchParams();
  const patch: MarketplaceNavigationQuery = item.query ?? {};
  const nextQuery = { ...query, q: patch.q, kind: patch.kind, category: patch.category, ...patch, cursor: undefined };
  for (const [key, value] of Object.entries(nextQuery)) {
    if (value) params.set(key, value);
  }
  return `/marketplace${params.size ? `?${params.toString()}` : ""}`;
}

function TreeItems({ items, query, depth = 0 }: { items: readonly MarketplaceNavigationItem[]; query: DirectoryQuery; depth?: number }) {
  return (
    <ul className={depth === 0 ? styles.categoryTreeRoot : styles.categoryTreeChildren}>
      {items.map((item) => {
        const active = matches(item, query);
        if (item.children?.length) {
          return (
            <li key={item.id}>
              <details className={styles.categoryFolder} open={hasActiveChild(item, query)}>
                <summary>
                  {depth === 0 && item.id in sectionIcons ? (() => {
                    const Icon = sectionIcons[item.id as keyof typeof sectionIcons];
                    return <Icon aria-hidden="true" />;
                  })() : null}
                  <span>{item.label}</span>
                  <ChevronRight aria-hidden="true" className={styles.categoryChevron} />
                </summary>
                <div className={styles.categoryFolderContent}>
                  {item.query ? <Link className={styles.categoryAllLink} href={hrefFor(query, item)}>View all {item.label.toLowerCase()}</Link> : null}
                  <TreeItems depth={depth + 1} items={item.children} query={query} />
                </div>
              </details>
            </li>
          );
        }

        return (
          <li key={item.id}>
            <Link aria-current={active ? "page" : undefined} className={`${styles.categoryLink} ${active ? styles.categoryLinkActive : ""}`} href={hrefFor(query, item)}>
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function MarketplaceCategoryTree({ query }: { query: DirectoryQuery }) {
  return (
    <aside className={styles.categorySidebar} aria-label="Marketplace categories">
      <div className={styles.categorySidebarHeading}>
        <span>Browse categories</span>
        <Link href="/marketplace">All listings</Link>
      </div>
      <TreeItems items={MARKETPLACE_NAVIGATION} query={query} />
    </aside>
  );
}
