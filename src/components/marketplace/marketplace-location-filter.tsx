"use client";

import { MapPin, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";

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

export function MarketplaceLocationFilter({ query }: { query: DirectoryQuery }) {
  const router = useRouter();
  const inputId = useId();
  const initialValue = useMemo(() => locationLabel(query), [query]);
  const [value, setValue] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<CityLocationSuggestion[]>([]);
  const [selected, setSelected] = useState<CityLocationSuggestion | null>(null);

  useEffect(() => {
    setValue(initialValue);
    setSelected(null);
  }, [initialValue]);

  useEffect(() => {
    const term = value.trim();
    if (selected || term.length < 2) {
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
  }, [selected, value]);

  function apply(patch: DirectoryQuery) {
    router.push(marketplaceHref({ ...query, ...patch, cursor: undefined }));
  }

  function choose(suggestion: CityLocationSuggestion) {
    setSelected(suggestion);
    setValue(suggestion.label);
    setSuggestions([]);
    apply({ city: suggestion.city, region: suggestion.region || undefined, country: undefined });
  }

  function submit() {
    const term = value.trim();
    if (!term) {
      apply({ country: undefined, region: undefined, city: undefined });
      return;
    }
    if (selected) {
      choose(selected);
      return;
    }
    if (/^[a-z]{2}$/i.test(term)) {
      apply({ country: term.toUpperCase(), region: undefined, city: undefined });
      return;
    }
    apply({ country: undefined, region: undefined, city: term });
  }

  const hasLocation = Boolean(query.country || query.region || query.city);

  return (
    <div className={styles.locationQuickFilter}>
      <MapPin aria-hidden="true" />
      <label className={styles.srOnly} htmlFor={inputId}>Search listings near a location</label>
      <div className={styles.locationQuickInput}>
        <input
          autoComplete="off"
          className={styles.field}
          id={inputId}
          onChange={(event) => {
            setSelected(null);
            setValue(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Search near a city, region, or country code"
          value={value}
        />
        {suggestions.length ? (
          <div aria-label="Location suggestions" className={styles.locationSuggestions} role="listbox">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.label}
                aria-selected={false}
                onClick={() => {
                  choose(suggestion);
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
      <button className={styles.secondaryButton} onClick={submit} type="button"><Search aria-hidden="true" />Search area</button>
      {hasLocation ? <button aria-label="Clear location filter" className={styles.iconButton} data-tooltip="Clear location." onClick={() => apply({ country: undefined, region: undefined, city: undefined })} type="button"><X aria-hidden="true" /></button> : null}
    </div>
  );
}
