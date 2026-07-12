"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { SettingsCard } from "@/modules/settings-secure-areas/types";

type SettingsSearchEntry = {
  title: string;
  description: string;
  href: string;
  badge: string;
  sensitive: boolean;
  keywords: string[];
};

const settingShortcuts: SettingsSearchEntry[] = [
  {
    title: "Edit Profile",
    description: "Edit display name, bio, avatar, banner, location, and visibility.",
    href: "/profile/edit",
    badge: "Profile",
    sensitive: false,
    keywords: ["name", "bio", "avatar", "banner", "public profile", "identity"]
  },
  {
    title: "My Pics",
    description: "Open your photo gallery without the secure settings wall.",
    href: "/profile/gallery",
    badge: "Pics",
    sensitive: false,
    keywords: ["photos", "pictures", "gallery", "my pics", "avatar image", "banner image"]
  },
  {
    title: "My Scientology",
    description: "Manage Scientology-specific classification, org, training, processing, and privacy.",
    href: "/profile/scientology",
    badge: "Profile",
    sensitive: false,
    keywords: ["scientology", "public", "staff", "sea org", "auditor", "training", "processing", "org"]
  },
  {
    title: "My Resume",
    description: "Build a printable professional resume with optional My Scientology summary.",
    href: "/settings/profile/resume",
    badge: "Profile",
    sensitive: false,
    keywords: ["resume", "cv", "career", "work history", "experience", "skills", "print"]
  },
  {
    title: "Blocked Users",
    description: "Manage blocked users and account protection rules.",
    href: "/secure-area?next=/settings/security",
    badge: "secure",
    sensitive: true,
    keywords: ["blocked", "block", "security", "password", "sessions", "admin mode"]
  },
  {
    title: "Notification Rules",
    description: "Review notification and alert behavior.",
    href: "/secure-area?next=/settings/notifications",
    badge: "secure",
    sensitive: true,
    keywords: ["notifications", "alerts", "mobile app"]
  },
  {
    title: "Create Invite",
    description: "Open your invite eligibility and unused private membership invite codes.",
    href: "/secure-area?next=/settings/invite",
    badge: "secure",
    sensitive: true,
    keywords: ["invite", "invite code", "my invite codes", "membership invite", "eligibility"]
  }
];

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function matchesSearch(entry: SettingsSearchEntry, query: string) {
  const terms = normalize(query).split(" ").filter(Boolean);
  if (terms.length === 0) return true;

  const haystack = normalize([entry.title, entry.description, entry.badge, ...entry.keywords].join(" "));
  return terms.every((term) => haystack.includes(term));
}

export function SettingsHub({ cards }: { cards: SettingsCard[] }) {
  const [query, setQuery] = useState("");
  const inviteCardVisible = cards.some((card) => card.badge === "Invites");
  const entries = useMemo<SettingsSearchEntry[]>(() => {
    const cardEntries = cards.map((card) => ({
      title: card.title,
      description: card.description,
      href: card.href,
      badge: card.sensitive ? "secure" : card.badge,
      sensitive: card.sensitive,
      keywords: [card.badge, card.href]
    }));

    const byKey = new Map<string, SettingsSearchEntry>();
    const shortcuts = inviteCardVisible ? settingShortcuts : settingShortcuts.filter((entry) => !entry.keywords.includes("invite"));

    [...shortcuts, ...cardEntries].forEach((entry) => {
      byKey.set(`${entry.href}:${entry.title}`, entry);
    });

    return [...byKey.values()];
  }, [cards, inviteCardVisible]);
  const visibleEntries = useMemo(() => entries.filter((entry) => matchesSearch(entry, query)), [entries, query]);
  const visibleCards = useMemo(() => cards.filter((card) => matchesSearch({ ...card, keywords: [card.badge, card.href] }, query)), [cards, query]);
  const showingSearch = query.trim().length > 0;

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Settings</p>
        <h1 className="mt-3 text-3xl font-semibold">Choose a settings area</h1>
        <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
          Start with a category. Each category opens a focused page for the related settings and actions.
        </p>
        <label className="mt-5 grid gap-2">
          <span className="form-label">Search settings</span>
          <input
            aria-label="Search settings"
            className="form-field"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try: pics, invite, blocked users, notifications, My Scientology"
            type="search"
            value={query}
          />
        </label>
      </section>
      <section className="surface rounded-md p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">{showingSearch ? "Search Results" : "Settings Areas"}</p>
            <h2 className="mt-2 text-2xl font-semibold">{showingSearch ? `${visibleEntries.length} matching setting${visibleEntries.length === 1 ? "" : "s"}` : "Choose a category"}</h2>
          </div>
          {showingSearch ? (
            <button className="btn-secondary" onClick={() => setQuery("")} type="button">
              Clear search
            </button>
          ) : null}
        </div>
        <div className="settings-card-grid mt-5">
          {(showingSearch ? visibleEntries : visibleCards).length > 0 ? (
            (showingSearch ? visibleEntries : visibleCards).map((entry) => (
              <Link className="module-card rounded-md p-5" href={entry.href} key={`${entry.href}:${entry.title}`}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-xl font-semibold text-[var(--gold)]">{entry.title}</h3>
                  <span className="pill rounded-full px-3 py-1 text-xs">{entry.sensitive ? "secure" : entry.badge}</span>
                </div>
                <p className="mt-3 leading-6 text-[var(--muted)]">{entry.description}</p>
              </Link>
            ))
          ) : (
            <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-[var(--muted)]">No settings match that search.</p>
          )}
        </div>
      </section>
    </div>
  );
}
