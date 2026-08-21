import type { MarketplaceListingKind } from "./marketplace.contracts";
import { MARKETPLACE_TAXONOMY, type MarketplaceTaxonomyCategory } from "./marketplace-taxonomy";

export type MarketplaceNavigationQuery = {
  category?: string;
  kind?: MarketplaceListingKind;
  q?: string;
  subcategory?: string;
};

export type MarketplaceNavigationItem = {
  children?: readonly MarketplaceNavigationItem[];
  href?: string;
  id: string;
  label: string;
  query?: MarketplaceNavigationQuery;
};

export type MarketplaceAvailableCategory = {
  category: string;
  kind: MarketplaceListingKind;
  subcategory: string | null;
};

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function categoryItem(kind: MarketplaceListingKind, category: MarketplaceTaxonomyCategory, prefix = kind.toLowerCase()): MarketplaceNavigationItem {
  const query = { kind, category: category.label } as const;
  return {
    id: `${prefix}-${slugify(category.label)}`,
    label: category.label,
    query,
    children: category.subcategories.map((subcategory) => ({
      id: `${prefix}-${slugify(category.label)}-${slugify(subcategory)}`,
      label: subcategory,
      query: { ...query, subcategory },
    })),
  };
}

function categoryItems(kind: MarketplaceListingKind, prefix?: string) {
  return MARKETPLACE_TAXONOMY[kind].map((category) => categoryItem(kind, category, prefix));
}

export const MARKETPLACE_NAVIGATION: readonly MarketplaceNavigationItem[] = [
  {
    id: "buy",
    label: "Buy",
    children: [
      ...categoryItems("GOODS", "goods"),
      { id: "vehicles", label: "Vehicles", query: { kind: "VEHICLE" }, children: categoryItems("VEHICLE", "vehicle") },
    ],
  },
  {
    id: "services",
    label: "Services",
    children: [
      ...categoryItems("SERVICE", "service"),
      { id: "auditors", label: "Auditors & field groups", query: { kind: "AUDITOR" }, children: categoryItems("AUDITOR", "auditor") },
    ],
  },
  { id: "rentals", label: "Rentals", children: categoryItems("RENTAL", "rental") },
  {
    id: "find",
    label: "Find",
    children: [
      { id: "find-people", label: "People", href: "/people" },
      { id: "find-groups", label: "Groups", href: "/groups" },
      { id: "find-businesses", label: "Businesses", query: { kind: "SERVICE", category: "Business Services" } },
      { id: "find-directory", label: "Church & auditor directory", href: "/auditors" },
    ],
  },
  {
    id: "business",
    label: "Business",
    children: [
      { id: "find-job", label: "Jobs", query: { kind: "JOB" }, children: categoryItems("JOB", "job") },
      { id: "b2b", label: "B2B services", query: { kind: "SERVICE", category: "Business Services" } },
      { id: "office-business-goods", label: "Business equipment", query: { kind: "GOODS", category: "Office & Business" } },
      { id: "commercial-rentals", label: "Commercial property", query: { kind: "RENTAL", category: "Commercial Property" } },
    ],
  },
];

function queryHasListings(query: MarketplaceNavigationQuery | undefined, available: readonly MarketplaceAvailableCategory[]) {
  if (!query?.kind) return false;
  return available.some((path) =>
    path.kind === query.kind &&
    (!query.category || path.category === query.category) &&
    (!query.subcategory || path.subcategory === query.subcategory),
  );
}

export function filterMarketplaceNavigation(
  items: readonly MarketplaceNavigationItem[],
  available: readonly MarketplaceAvailableCategory[],
): MarketplaceNavigationItem[] {
  return items.flatMap((item) => {
    const children = item.children ? filterMarketplaceNavigation(item.children, available) : [];
    const keep = Boolean(item.href) || queryHasListings(item.query, available) || children.length > 0;
    return keep ? [{ ...item, children: children.length ? children : undefined }] : [];
  });
}
