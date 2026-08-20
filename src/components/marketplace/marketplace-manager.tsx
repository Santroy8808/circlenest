"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Archive, CheckCircle2, Clock3, Grid3X3, List, Pause, Pencil, Play, Plus, RefreshCw, ShieldCheck, X } from "lucide-react";

import type { MarketplaceListingDetailView } from "@/modules/marketplace/marketplace-view";
import { MarketplaceCard } from "./marketplace-card";
import { marketplaceDateLabel, marketplacePriceLabel } from "./marketplace-format";
import styles from "./marketplace.module.css";

type Action = "ACTIVE" | "PAUSED" | "RESERVED" | "FULFILLED" | "ARCHIVED" | "renew";

export function MarketplaceManager({ initialListings }: { initialListings: MarketplaceListingDetailView[] }) {
  const [listings, setListings] = useState(initialListings);
  const [filter, setFilter] = useState("CURRENT");
  const [compact, setCompact] = useState(true);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState("");
  const [isPending, startTransition] = useTransition();
  const visible = useMemo(() => listings.filter((listing) => filter === "ALL" || (filter === "CURRENT" ? !["ARCHIVED", "REMOVED", "FULFILLED"].includes(listing.status) : listing.status === filter)), [filter, listings]);
  const counts = useMemo(() => ({ active: listings.filter((item) => item.status === "ACTIVE").length, draft: listings.filter((item) => item.status === "DRAFT").length, expired: listings.filter((item) => item.status === "EXPIRED").length }), [listings]);

  function runAction(listing: MarketplaceListingDetailView, action: Action) {
    setPendingId(listing.id);
    setError("");
    startTransition(async () => {
      const endpoint = action === "renew" ? `/api/v2/marketplace/listings/${listing.id}/renew` : action === "ACTIVE" ? `/api/v2/marketplace/listings/${listing.id}/publish` : `/api/v2/marketplace/listings/${listing.id}/status`;
      const response = await fetch(endpoint, { method: "POST", headers: action === "renew" || action === "ACTIVE" ? undefined : { "Content-Type": "application/json" }, body: action === "renew" || action === "ACTIVE" ? undefined : JSON.stringify({ status: action }) });
      const payload = await response.json() as { error?: string; listing?: MarketplaceListingDetailView };
      if (!response.ok || !payload.listing) setError(payload.error ?? "Could not update the listing.");
      else setListings((current) => current.map((item) => item.id === listing.id ? payload.listing! : item));
      setPendingId("");
    });
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}><div><p className={styles.eyebrow}>Publisher workspace</p><h1>My listings</h1><p className={styles.subhead}>Keep listings current so search results remain useful and trustworthy.</p></div><div className={styles.headerActions}><Link className={styles.secondaryButton} href="/marketplace/interactions"><ShieldCheck aria-hidden="true" />Exchanges</Link><Link className={styles.primaryButton} href="/marketplace/new"><Plus aria-hidden="true" />Create listing</Link></div></header>
      <div className={styles.statsStrip}><div><strong>{counts.active}</strong><span>Active</span></div><div><strong>{counts.draft}</strong><span>Drafts</span></div><div><strong>{counts.expired}</strong><span>Expired</span></div><div><strong>{listings.reduce((sum, item) => sum + item.inquiryCount, 0)}</strong><span>Inquiries</span></div></div>
      <div className={styles.managerToolbar}><label><span>Status</span><select className={styles.select} onChange={(event) => setFilter(event.target.value)} value={filter}><option value="CURRENT">Current</option><option value="ALL">All</option><option value="ACTIVE">Active</option><option value="DRAFT">Drafts</option><option value="PAUSED">Paused</option><option value="RESERVED">Reserved</option><option value="EXPIRED">Expired</option><option value="FULFILLED">Fulfilled</option><option value="ARCHIVED">Archived</option></select></label><div className={styles.viewActions}><button aria-label="Grid view" className={!compact ? styles.iconButton : styles.secondaryButton} data-tooltip="Grid view." onClick={() => setCompact(false)} type="button"><Grid3X3 aria-hidden="true" /></button><button aria-label="Compact view" className={compact ? styles.iconButton : styles.secondaryButton} data-tooltip="Compact view." onClick={() => setCompact(true)} type="button"><List aria-hidden="true" /></button></div></div>
      {error ? <div className={styles.formError} role="alert"><X aria-hidden="true" />{error}</div> : null}
      {visible.length ? <div className={compact ? styles.managementList : styles.cardGrid}>{visible.map((listing) => compact ? <article className={styles.managementRow} key={listing.id}><div className={styles.managementThumb}>{listing.primaryMedia?.url ? <img alt="" src={listing.primaryMedia.url} /> : <span>{listing.kind}</span>}</div><div className={styles.managementMain}><p className={styles.sectionLabel}>{listing.status} · {listing.kind}</p><h2><Link href={`/marketplace/${listing.slug}`}>{listing.title}</Link></h2><p>{marketplacePriceLabel(listing)} · Published {marketplaceDateLabel(listing.publishedAt)} · Expires {marketplaceDateLabel(listing.expiresAt)}</p></div><div className={styles.managementMetrics}><span>{listing.viewCount} views</span><span>{listing.saveCount} saves</span><span>{listing.inquiryCount} inquiries</span></div><div className={styles.managementActions}><Link aria-label="Edit listing" className={styles.iconButton} data-tooltip="Edit listing." href={`/marketplace/${listing.slug}/edit`}><Pencil aria-hidden="true" /></Link>{["DRAFT", "PAUSED", "EXPIRED"].includes(listing.status) ? <button aria-label="Publish listing" className={styles.iconButton} data-tooltip="Publish listing." disabled={isPending && pendingId === listing.id} onClick={() => runAction(listing, "ACTIVE")} type="button"><Play aria-hidden="true" /></button> : null}{listing.status === "ACTIVE" ? <><button aria-label="Pause listing" className={styles.iconButton} data-tooltip="Pause listing." onClick={() => runAction(listing, "PAUSED")} type="button"><Pause aria-hidden="true" /></button><button aria-label="Mark reserved" className={styles.iconButton} data-tooltip="Mark reserved." onClick={() => runAction(listing, "RESERVED")} type="button"><Clock3 aria-hidden="true" /></button></> : null}{listing.status === "RESERVED" ? <button aria-label="Mark fulfilled" className={styles.iconButton} data-tooltip="Mark fulfilled." onClick={() => runAction(listing, "FULFILLED")} type="button"><CheckCircle2 aria-hidden="true" /></button> : null}{["ACTIVE", "EXPIRED", "PAUSED"].includes(listing.status) ? <button aria-label="Renew listing" className={styles.iconButton} data-tooltip="Renew for 30 days." onClick={() => runAction(listing, "renew")} type="button"><RefreshCw aria-hidden="true" /></button> : null}{listing.status !== "ARCHIVED" ? <button aria-label="Archive listing" className={styles.iconButton} data-tooltip="Archive listing." onClick={() => runAction(listing, "ARCHIVED")} type="button"><Archive aria-hidden="true" /></button> : null}</div></article> : <MarketplaceCard key={listing.id} listing={listing} />)}</div> : <div className={styles.emptyState}><div><Archive aria-hidden="true" /><h2>No listings in this view</h2><p>Create a new listing or choose a different status.</p></div></div>}
    </div>
  );
}
