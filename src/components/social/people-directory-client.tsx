"use client";

import { useEffect, useRef, useState } from "react";
import { ListingViewMode } from "@/modules/listing-preferences/types";
import type { PeopleCardView } from "@/modules/social-graph/types";
import { PeopleGrid } from "@/components/social/people-grid";

export function PeopleDirectoryClient({
  initialPeople,
  initialView
}: {
  initialPeople: PeopleCardView[];
  initialView: ListingViewMode;
}) {
  const [people, setPeople] = useState(initialPeople);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const hasMounted = useRef(false);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      const cleanQuery = query.trim();
      setError("");
      setLoading(cleanQuery.length > 0);

      try {
        const response = await fetch(`/api/people?q=${encodeURIComponent(cleanQuery)}`, {
          cache: "no-store",
          signal: controller.signal
        });
        const payload = (await response.json()) as { error?: string; people?: PeopleCardView[] };

        if (!response.ok) {
          setError(payload.error ?? "Could not search people.");
          return;
        }

        setPeople(payload.people ?? []);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setError("Could not search people.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query]);

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">People</p>
            <h1 className="mt-3 text-3xl font-semibold">Browse People</h1>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
              Find members by full name, username, location, or profile text. Private and blocked profiles stay hidden.
            </p>
          </div>
          <div className="rounded-md border border-[var(--line)] bg-black/20 px-4 py-3 text-sm">
            <p className="text-[var(--muted)]">{loading ? "Searching" : "Visible"}</p>
            <p className="mt-1 font-semibold text-[var(--gold)]">{people.length} people</p>
          </div>
        </div>
        <input
          aria-label="Live search people"
          className="form-field mt-6"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Start typing a full name, username, location..."
          type="search"
          value={query}
        />
        {error ? <p className="mt-4 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
      </section>

      {people.length > 0 ? (
        <PeopleGrid initialView={initialView} people={people} surface="people" />
      ) : (
        <section className="surface rounded-md p-8 text-center">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">No matching people</h2>
          <p className="mt-2 text-[var(--muted)]">Try a full name, username, location, or profile phrase.</p>
        </section>
      )}
    </div>
  );
}
