"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Bell, BellOff, Bookmark, ExternalLink, Plus, Search, Trash2, X } from "lucide-react";

import type { MarketplaceListingCardView } from "@/modules/marketplace/marketplace-view";
import { MarketplaceCard } from "./marketplace-card";
import { marketplaceKindLabels } from "./marketplace-format";
import styles from "./marketplace.module.css";

type SavedSearch = {
  id: string;
  name: string;
  query: Record<string, unknown>;
  frequency: "NONE" | "IMMEDIATE" | "DAILY" | "WEEKLY";
  enabled: boolean;
  lastRunAt: string | null;
};

function searchHref(query: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const key of ["q", "kind", "intent", "category", "countryCode", "region", "city", "sort"] as const) {
    const value = query[key];
    if (typeof value === "string" && value) params.set(key === "countryCode" ? "country" : key, value);
  }
  if (typeof query.remote === "boolean") params.set("remote", String(query.remote));
  return `/marketplace?${params.toString()}`;
}

export function MarketplaceSavedWorkspace({ initialListings, initialSearches }: { initialListings: MarketplaceListingCardView[]; initialSearches: SavedSearch[] }) {
  const [searches, setSearches] = useState(initialSearches);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [frequency, setFrequency] = useState<SavedSearch["frequency"]>("DAILY");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function createSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      setError("");
      const response = await fetch("/api/v2/marketplace/saved", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, frequency, query: { q: query || undefined, kind: kind || undefined, sort: "newest", facets: {} } }) });
      const payload = await response.json() as { error?: string; savedSearch?: SavedSearch };
      if (!response.ok || !payload.savedSearch) { setError(payload.error ?? "Could not save the search."); return; }
      setSearches((current) => [payload.savedSearch!, ...current]);
      setName(""); setQuery(""); setKind("");
    });
  }

  function updateSearch(saved: SavedSearch, patch: Partial<SavedSearch>) {
    startTransition(async () => {
      const response = await fetch(`/api/v2/marketplace/saved/${saved.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const payload = await response.json() as { error?: string; savedSearch?: SavedSearch };
      if (!response.ok || !payload.savedSearch) setError(payload.error ?? "Could not update the search.");
      else setSearches((current) => current.map((item) => item.id === saved.id ? payload.savedSearch! : item));
    });
  }

  function deleteSearch(id: string) {
    startTransition(async () => {
      const response = await fetch(`/api/v2/marketplace/saved/${id}`, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) setError(payload.error ?? "Could not delete the search.");
      else setSearches((current) => current.filter((item) => item.id !== id));
    });
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}><div><p className={styles.eyebrow}>Watch the marketplace</p><h1>Saved listings & searches</h1><p className={styles.subhead}>Keep useful listings nearby and receive private alerts when new matches appear.</p></div><Link className={styles.secondaryButton} href="/marketplace"><Search aria-hidden="true" />Browse Marketplace</Link></header>
      {error ? <div className={styles.formError} role="alert"><X aria-hidden="true" />{error}</div> : null}

      <section className={styles.savedSection}><div className={styles.savedSectionHeader}><div><p className={styles.sectionLabel}>Saved searches</p><h2>Alert rules</h2></div><span>{searches.length}</span></div><form className={styles.savedSearchForm} onSubmit={createSearch}><label className={styles.formField}><span>Name</span><input className={styles.field} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Austin office jobs" required value={name} /></label><label className={styles.formField}><span>Keywords</span><input className={styles.field} maxLength={160} onChange={(event) => setQuery(event.target.value)} placeholder="office manager" value={query} /></label><label className={styles.formField}><span>Type</span><select className={styles.select} onChange={(event) => setKind(event.target.value)} value={kind}><option value="">All listing types</option>{Object.entries(marketplaceKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className={styles.formField}><span>Alert cadence</span><select className={styles.select} onChange={(event) => setFrequency(event.target.value as SavedSearch["frequency"])} value={frequency}><option value="IMMEDIATE">Every 15 minutes</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="NONE">No alerts</option></select></label><button className={styles.primaryButton} disabled={isPending} type="submit"><Plus aria-hidden="true" />Save search</button></form>{searches.length ? <div className={styles.savedSearchList}>{searches.map((saved) => <article key={saved.id}><span className={styles.savedSearchIcon}>{saved.enabled && saved.frequency !== "NONE" ? <Bell aria-hidden="true" /> : <BellOff aria-hidden="true" />}</span><div><h3>{saved.name}</h3><p>{saved.frequency === "IMMEDIATE" ? "Every 15 minutes" : saved.frequency.toLowerCase()} · {saved.enabled ? "Active" : "Paused"}</p></div><div className={styles.inlineActions}><Link aria-label={`Open ${saved.name}`} className={styles.iconButton} data-tooltip="Open matching listings." href={searchHref(saved.query)}><ExternalLink aria-hidden="true" /></Link><button aria-label={saved.enabled ? "Pause alerts" : "Resume alerts"} className={styles.iconButton} data-tooltip={saved.enabled ? "Pause alerts." : "Resume alerts."} disabled={isPending} onClick={() => updateSearch(saved, { enabled: !saved.enabled })} type="button">{saved.enabled ? <BellOff aria-hidden="true" /> : <Bell aria-hidden="true" />}</button><button aria-label="Delete saved search" className={styles.iconButton} data-tooltip="Delete saved search." disabled={isPending} onClick={() => deleteSearch(saved.id)} type="button"><Trash2 aria-hidden="true" /></button></div></article>)}</div> : <p className={styles.savedEmpty}>No saved searches yet.</p>}</section>

      <section className={styles.savedSection}><div className={styles.savedSectionHeader}><div><p className={styles.sectionLabel}>Bookmarked</p><h2>Saved listings</h2></div><span>{initialListings.length}</span></div>{initialListings.length ? <div className={styles.cardGrid}>{initialListings.map((listing) => <MarketplaceCard key={listing.id} listing={listing} />)}</div> : <div className={styles.emptyState}><div><Bookmark aria-hidden="true" /><h2>No saved listings</h2><p>Use Save on any listing you want to revisit.</p></div></div>}</section>
    </div>
  );
}
