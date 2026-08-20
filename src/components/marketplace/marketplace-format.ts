import type { MarketplaceListingCardView } from "@/modules/marketplace/marketplace-view";

export const marketplaceKindLabels: Record<MarketplaceListingCardView["kind"], string> = {
  GOODS: "Items",
  VEHICLE: "Vehicles",
  RENTAL: "Rentals",
  SERVICE: "Services",
  JOB: "Jobs",
  AUDITOR: "Auditing",
};

export function marketplacePriceLabel(listing: Pick<MarketplaceListingCardView, "currency" | "priceCents" | "priceMaxCents" | "priceMinCents" | "priceType">) {
  const format = (cents: number) => new Intl.NumberFormat("en", { style: "currency", currency: listing.currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
  if (listing.priceType === "FREE") return "Free";
  if (listing.priceType === "TRADE") return "Trade";
  if (listing.priceType === "QUOTE") return "Request a quote";
  if (listing.priceType === "CONTACT") return "Contact for price";
  if (listing.priceType === "RANGE" && listing.priceMinCents != null && listing.priceMaxCents != null) return `${format(listing.priceMinCents)} - ${format(listing.priceMaxCents)}`;
  if (listing.priceCents != null) return `${format(listing.priceCents)}${listing.priceType === "NEGOTIABLE" ? " negotiable" : ""}`;
  return "Price not listed";
}

export function marketplaceLocationLabel(listing: Pick<MarketplaceListingCardView, "city" | "countryCode" | "region" | "remote">) {
  const place = [listing.city, listing.region, listing.countryCode].filter(Boolean).join(", ");
  if (listing.remote && place) return `${place} + remote`;
  return listing.remote ? "Remote" : place || "Location not listed";
}

export function marketplaceDateLabel(value: string | null) {
  if (!value) return "Not published";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
