"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import type { GroupCardView, GroupDirectoryMode } from "@/modules/groups/types";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function GroupsDirectoryClient({
  initialGroups,
  initialMode,
  initialNextCursor
}: {
  initialGroups: GroupCardView[];
  initialMode: GroupDirectoryMode;
  initialNextCursor: string | null;
}) {
  const [groups, setGroups] = useState(initialGroups);
  const [mode, setMode] = useState<GroupDirectoryMode>(initialMode);
  const [query, setQuery] = useState("");
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const hasMounted = useRef(false);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }

    setNextCursor(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setError("");
      const effectiveMode = query.trim() ? "discover" : mode;
      try {
        const response = await fetch(`/api/groups?mode=${effectiveMode}&q=${encodeURIComponent(query)}`, {
          cache: "no-store",
          signal: controller.signal
        });
        const payload = (await response.json()) as {
          error?: string;
          groups?: GroupCardView[];
          nextCursor?: string | null;
        };

        if (!response.ok) {
          setError(payload.error ?? "Could not load groups.");
          return;
        }

        setGroups(payload.groups ?? []);
        setNextCursor(payload.nextCursor ?? null);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setError("Could not load groups.");
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [mode, query]);

  function toggleMode(nextMode: GroupDirectoryMode) {
    startTransition(() => {
      setMode(nextMode);
    });
  }

  function loadMore() {
    if (!nextCursor) return;
    setError("");

    startTransition(async () => {
      const effectiveMode = query.trim() ? "discover" : mode;
      const params = new URLSearchParams({ mode: effectiveMode, cursor: nextCursor });
      if (query.trim()) params.set("q", query.trim());

      try {
        const response = await fetch(`/api/groups?${params.toString()}`, { cache: "no-store" });
        const payload = (await response.json()) as {
          error?: string;
          groups?: GroupCardView[];
          nextCursor?: string | null;
        };
        if (!response.ok) {
          setError(payload.error ?? "Could not load more groups.");
          return;
        }

        setGroups((current) => {
          const byId = new Map(current.map((group) => [group.id, group]));
          for (const group of payload.groups ?? []) byId.set(group.id, group);
          return Array.from(byId.values());
        });
        setNextCursor(payload.nextCursor ?? null);
      } catch {
        setError("Could not load more groups.");
      }
    });
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">People</p>
            <h1 className="mt-3 text-3xl font-semibold">Groups</h1>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
              See your groups first, or search by name or topic to find more.
            </p>
          </div>
          <Link className="btn-primary" href="/groups/create">
            Create
          </Link>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-[1fr_auto]">
          <label className="grid gap-2">
            <span className="sr-only">Search groups</span>
            <input
              className="form-field"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search groups by name or topic"
              value={query}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {(["joined", "mine", "discover"] as GroupDirectoryMode[]).map((item) => (
              <button
                aria-pressed={mode === item && !query.trim()}
                className={mode === item && !query.trim() ? "btn-primary px-4 py-2" : "btn-secondary px-4 py-2"}
                disabled={isPending}
                key={item}
                onClick={() => toggleMode(item)}
                type="button"
              >
                {item === "joined" ? "Joined" : item === "mine" ? "My Groups" : "Discover"}
              </button>
            ))}
          </div>
        </div>
        {error ? <p className="mt-4 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100" role="alert">{error}</p> : null}
      </section>

      {groups.length === 0 ? (
        <section className="surface rounded-md p-8 text-center">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">No groups here yet</h2>
          <p className="mt-2 text-[var(--muted)]">Create one, join one, or search public groups.</p>
        </section>
      ) : (
        <section className="groups-grid">
          {groups.map((group) => (
            <Link className="group-card" href={`/groups/${group.slug}`} key={group.id}>
              <div className="group-card-banner">
                {group.bannerUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" decoding="async" fetchPriority="low" loading="lazy" src={group.bannerUrl} />
                ) : null}
              </div>
              <div className="group-card-body">
                <span className="group-avatar">
                  {group.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" decoding="async" fetchPriority="low" loading="lazy" src={group.avatarUrl} />
                  ) : (
                    initials(group.name)
                  )}
                </span>
                <div className="mt-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-semibold text-[var(--gold)]">{group.name}</h2>
                    <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">{group.tagline ?? "No tagline yet."}</p>
                  </div>
                  {group.isPinned ? <span className="pill rounded-full px-2 py-1 text-xs">Pinned</span> : null}
                </div>
                <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[var(--gold)]">
                  {group.memberCount} members · {group.visibility.toLowerCase()}
                </p>
              </div>
            </Link>
          ))}
        </section>
      )}
      {nextCursor ? (
        <div className="flex justify-center">
          <button className="btn-secondary min-w-40" disabled={isPending} onClick={loadMore} type="button">
            {isPending ? "Loading…" : "Load more groups"}
          </button>
        </div>
      ) : null}
      <p aria-live="polite" className="sr-only">{error}</p>
    </div>
  );
}
