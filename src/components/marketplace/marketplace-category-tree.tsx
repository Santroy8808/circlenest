"use client";

import Link from "next/link";
import { BriefcaseBusiness, ChevronRight, FolderSearch2, Search, ShoppingBag, Wrench } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  filterMarketplaceNavigation,
  MARKETPLACE_NAVIGATION,
  type MarketplaceAvailableCategory,
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
  const nextQuery = { ...query, q: patch.q, kind: patch.kind, category: patch.category, subcategory: patch.subcategory, ...patch, cursor: undefined };
  for (const [key, value] of Object.entries(nextQuery)) {
    if (value) params.set(key, value);
  }
  return `/marketplace${params.size ? `?${params.toString()}` : ""}`;
}

type FolderControls = {
  close: (id: string) => void;
  hovered: ReadonlySet<string>;
  manual: ReadonlySet<string>;
  open: (id: string) => void;
  toggle: (id: string) => void;
};

function TreeItems({ controls, items, query, depth = 0 }: { controls: FolderControls; items: readonly MarketplaceNavigationItem[]; query: DirectoryQuery; depth?: number }) {
  return (
    <ul className={depth === 0 ? styles.categoryTreeRoot : styles.categoryTreeChildren}>
      {items.map((item) => {
        const active = matches(item, query);
        if (item.children?.length) {
          const folderOpen = hasActiveChild(item, query) || controls.hovered.has(item.id) || controls.manual.has(item.id);
          return (
            <li key={item.id}>
              <details className={styles.categoryFolder} onMouseEnter={() => controls.open(item.id)} onMouseLeave={() => controls.close(item.id)} open={folderOpen}>
                <summary onClick={(event) => { event.preventDefault(); controls.toggle(item.id); }}>
                  {depth === 0 && item.id in sectionIcons ? (() => {
                    const Icon = sectionIcons[item.id as keyof typeof sectionIcons];
                    return <Icon aria-hidden="true" />;
                  })() : null}
                  <span>{item.label}</span>
                  <ChevronRight aria-hidden="true" className={styles.categoryChevron} />
                </summary>
                <div className={styles.categoryFolderContent}>
                  {item.query ? <Link className={styles.categoryAllLink} href={hrefFor(query, item)}>View all {item.label.toLowerCase()}</Link> : null}
                  <TreeItems controls={controls} depth={depth + 1} items={item.children} query={query} />
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

export function MarketplaceCategoryTree({ availableCategories, query }: { availableCategories: MarketplaceAvailableCategory[]; query: DirectoryQuery }) {
  const [hovered, setHovered] = useState<Set<string>>(() => new Set());
  const [manual, setManual] = useState<Set<string>>(() => new Set());
  const closeTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const items = useMemo(() => filterMarketplaceNavigation(MARKETPLACE_NAVIGATION, availableCategories), [availableCategories]);

  useEffect(() => () => {
    for (const timer of closeTimers.current.values()) clearTimeout(timer);
    closeTimers.current.clear();
  }, []);

  const controls: FolderControls = {
    hovered,
    manual,
    open(id) {
      const timer = closeTimers.current.get(id);
      if (timer) clearTimeout(timer);
      closeTimers.current.delete(id);
      setHovered((current) => new Set(current).add(id));
    },
    close(id) {
      const timer = closeTimers.current.get(id);
      if (timer) clearTimeout(timer);
      closeTimers.current.set(id, setTimeout(() => {
        setHovered((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        closeTimers.current.delete(id);
      }, 180));
    },
    toggle(id) {
      setManual((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
  };

  return (
    <aside className={styles.categorySidebar} aria-label="Marketplace categories">
      <div className={styles.categorySidebarHeading}>
        <span>Browse categories</span>
        <Link href="/marketplace">All listings</Link>
      </div>
      <TreeItems controls={controls} items={items} query={query} />
    </aside>
  );
}
