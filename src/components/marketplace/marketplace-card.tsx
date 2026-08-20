import Link from "next/link";
import { BriefcaseBusiness, Building2, CarFront, MapPin, Package, Search, UsersRound, Wrench } from "lucide-react";

import type { MarketplaceListingCardView } from "@/modules/marketplace/marketplace-view";
import { marketplaceKindLabels, marketplaceLocationLabel, marketplacePriceLabel } from "./marketplace-format";
import styles from "./marketplace.module.css";

const kindIcons = {
  GOODS: Package,
  VEHICLE: CarFront,
  RENTAL: Building2,
  SERVICE: Wrench,
  JOB: BriefcaseBusiness,
  AUDITOR: UsersRound,
};

export function MarketplaceCard({ listing, compact = false }: { listing: MarketplaceListingCardView; compact?: boolean }) {
  const KindIcon = kindIcons[listing.kind];
  return (
    <article className={`${styles.card} ${compact ? styles.cardCompact : ""}`}>
      <Link aria-label={`Open ${listing.title}`} className={styles.cardLink} href={`/marketplace/${listing.slug}`}>
        <div className={styles.cardMedia}>
          {listing.primaryMedia?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={listing.primaryMedia.altText ?? ""} src={listing.primaryMedia.url} />
          ) : (
            <div className={styles.cardPlaceholder}><KindIcon aria-hidden="true" /></div>
          )}
          {listing.summary ? <span className={styles.imageOverlay}>{listing.summary}</span> : null}
          <span className={styles.intentBadge}>{listing.intent === "WANTED" ? <Search aria-hidden="true" /> : null}{listing.intent === "WANTED" ? "Wanted" : "Offering"}</span>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.cardEyebrow}><span>{marketplaceKindLabels[listing.kind]}</span><span>{listing.category}</span></div>
          <h2>{listing.title}</h2>
          <p className={styles.publisher}>{listing.publisher.name}</p>
          <div className={styles.cardFooter}>
            <strong>{marketplacePriceLabel(listing)}</strong>
            <span><MapPin aria-hidden="true" />{marketplaceLocationLabel(listing)}</span>
          </div>
        </div>
      </Link>
    </article>
  );
}
