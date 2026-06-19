export const listingViewModes = ["square", "row", "compact"] as const;

export type ListingViewMode = (typeof listingViewModes)[number];

export const listingPreferenceSurfaces = ["market", "jobs", "people", "friends"] as const;

export type ListingPreferenceSurface = (typeof listingPreferenceSurfaces)[number];

export const listingViewLabels: Record<ListingViewMode, string> = {
  square: "Squares",
  row: "Rows",
  compact: "Compact"
};
