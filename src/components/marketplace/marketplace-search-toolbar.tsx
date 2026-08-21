"use client";

import { MapPin, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useId, useMemo, useState } from "react";

import type { CityLocationSuggestion } from "@/lib/platform/city-locations";
import styles from "./marketplace.module.css";

type DirectoryQuery = Record<string, string | undefined>;

function locationLabel(query: DirectoryQuery) {
  return [query.city, query.region, query.country].filter(Boolean).join(", ");
}

function marketplaceHref(query: DirectoryQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  return `/marketplace${params.size ? `?${params.toString()}` : ""}`;
}

export function MarketplaceSearchToolbar({ query }: { query: DirectoryQuery }) {
  const router = useRouter();
  const locationInputId = useId();
  const initialLocation = useMemo(() => locationLabel(query), [query]);
  const [keyword, setKeyword] = useState(query.q ?? "");
  const [intent, setIntent] = useState(query.intent ?? "");
  const [sort, setSort] = useState(query.sort ?? "newest");
  const [location, setLocation] = useState(initialLocation);
  const [suggestions, setSuggestions] = useState<CityLocationSuggestion[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<CityLocationSuggestion | null>(null);

  useEffect(() => {
    setKeyword(query.q ?? "");
    setIntent(query.intent ?? "");
    setSort(query.sort ?? "newest");
    setLocation(initialLocation);
    setSelectedLocation(null);
  }, [initialLocation, query.intent, query.q, query.sort]);

  useEffect(() => {
    const term = location.trim();
    if (selectedLocation || term.length < 2 || term === initialLocation) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/locations/cities?q=${encodeURIComponent(term)}&limit=6`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null) as { suggestions?: CityLocationSuggestion[] } | null;
        setSuggestions(response.ok && Array.isArray(payload?.suggestions) ? payload.suggestions : []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setSuggestions([]);
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [initialLocation, location, selectedLocation]);

  function locationPatch(): DirectoryQuery {
    const term = location.trim();
    if (!term) return { country: undefined, region: undefined, city: undefined };
    if (selectedLocation) {
      return { country: undefined, region: selectedLocation.region || undefined, city: selectedLocation.city };
    }
    if (term === initialLocation) return { country: query.country, region: query.region, city: query.city };
    if (/^[a-z]{2}$/i.test(term)) return { country: term.toUpperCase(), region: undefined, city: undefined };
    return { country: undefined, region: undefined, city: term };
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(marketplaceHref({
      ...query,
      ...locationPatch(),
      q: keyword.trim() || undefined,
      intent: intent || undefined,
      sort,
      cursor: undefined,
    }));
  }

  return (
    <form className={styles.marketplaceSearchForm} onSubmit={submit} role="search">
      <div className={styles.marketplaceSearchMain}>
        <label className={styles.searchInputShell}>
          <Search aria-hidden="true" />
          <span className={styles.srOnly}>Search Marketplace</span>
          <input autoComplete="off" onChange={(event) => setKeyword(event.target.value)} placeholder="What are you looking for?" value={keyword} />
        </label>

        <div className={styles.locationSearchShell}>
          <MapPin aria-hidden="true" />
          <label className={styles.srOnly} htmlFor={locationInputId}>Search near a location</label>
          <input
            aria-autocomplete="list"
            autoComplete="off"
            id={locationInputId}
            onBlur={() => window.setTimeout(() => setSuggestions([]), 120)}
            onChange={(event) => {
              setSelectedLocation(null);
              setLocation(event.target.value);
            }}
            placeholder="City, region, or country code"
            value={location}
          />
          {location ? <button aria-label="Clear location" className={styles.searchClearButton} onClick={() => { setLocation(""); setSelectedLocation(null); }} type="button"><X aria-hidden="true" /></button> : null}
          {suggestions.length ? (
            <div aria-label="Location suggestions" className={styles.locationSuggestions} role="listbox">
              {suggestions.map((suggestion) => (
                <button
                  aria-selected={selectedLocation?.label === suggestion.label}
                  key={suggestion.label}
                  onClick={() => {
                    setSelectedLocation(suggestion);
                    setLocation(suggestion.label);
                    setSuggestions([]);
                  }}
                  role="option"
                  type="button"
                >
                  <strong>{suggestion.city}</strong>
                  <span>{[suggestion.region, suggestion.country].filter(Boolean).join(", ")}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button className={styles.primaryButton} type="submit"><Search aria-hidden="true" />Search</button>
      </div>

      <div className={styles.marketplaceSearchOptions}>
        <label><span>Show</span><select aria-label="Offer or wanted" className={styles.select} onChange={(event) => setIntent(event.target.value)} value={intent}><option value="">Offers and wanted</option><option value="OFFER">Offers</option><option value="WANTED">Wanted</option></select></label>
        <label><span>Sort</span><select aria-label="Sort listings" className={styles.select} onChange={(event) => setSort(event.target.value)} value={sort}><option value="newest">Newest first</option><option value="relevance">Best match</option><option value="price_asc">Lowest price</option><option value="price_desc">Highest price</option></select></label>
      </div>
    </form>
  );
}
