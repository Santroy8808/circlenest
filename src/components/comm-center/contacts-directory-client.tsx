"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { SocialRelationshipType } from "@prisma/client";
import type { PeopleCardView } from "@/modules/social-graph/types";

type ContactFilter = "all" | "family" | "friends" | "acquaintances";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function hasRelationship(contact: PeopleCardView, filter: ContactFilter) {
  if (filter === "all") return true;
  if (filter === "family") return contact.relationships.includes(SocialRelationshipType.FAMILY);
  if (filter === "friends") return contact.relationships.includes(SocialRelationshipType.FRIEND);
  return contact.relationships.includes(SocialRelationshipType.ACQUAINTANCE);
}

function relationshipText(contact: PeopleCardView) {
  const labels = contact.relationships
    .filter((relationship) =>
      relationship === SocialRelationshipType.FAMILY ||
      relationship === SocialRelationshipType.FRIEND ||
      relationship === SocialRelationshipType.ACQUAINTANCE
    )
    .map((relationship) => {
      if (relationship === SocialRelationshipType.FAMILY) return contact.familyLabel ?? "Family";
      if (relationship === SocialRelationshipType.FRIEND) return "Friend";
      return "Acquaintance";
    });
  return labels.length ? labels.join(" / ") : "Contact";
}

function ContactAvatarLink({ contact }: { contact: PeopleCardView }) {
  return (
    <Link aria-label={`View ${contact.displayName}'s profile`} className="people-avatar h-14 w-14 flex-none" href={`/profile/${contact.username}`}>
      {contact.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" decoding="async" loading="lazy" src={contact.avatarUrl} />
      ) : (
        <span>{initials(contact.displayName) || "TS"}</span>
      )}
    </Link>
  );
}

export function ContactsDirectoryClient({ contacts }: { contacts: PeopleCardView[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ContactFilter>("all");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const visibleContacts = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    return contacts
      .filter((contact) => hasRelationship(contact, filter))
      .filter((contact) => {
        if (!cleanQuery) return true;
        return [contact.displayName, contact.fullName, contact.username, contact.location ?? "", relationshipText(contact)]
          .some((value) => value.toLowerCase().includes(cleanQuery));
      })
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }, [contacts, filter, query]);

  function startChat(targetUserId: string) {
    setError("");
    startTransition(async () => {
      const response = await fetch("/api/chat/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; thread?: { id: string } } | null;

      if (!response.ok || !payload?.thread?.id) {
        setError(payload?.error ?? "Could not start chat.");
        return;
      }

      window.location.href = `/messages?thread=${encodeURIComponent(payload.thread.id)}`;
    });
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Comm Center</p>
            <h1 className="mt-3 text-3xl font-semibold">Contacts</h1>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
              Family, friends, and acquaintances you can message or visit quickly.
            </p>
          </div>
          <Link className="btn-secondary" href="/people">
            Find Members
          </Link>
        </div>
        <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <input
            aria-label="Search contacts"
            className="form-field"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search contacts by name, username, location, or relationship"
            type="search"
            value={query}
          />
          <div className="flex flex-wrap gap-2">
            {([
              ["all", "All"],
              ["family", "Family"],
              ["friends", "Friends"],
              ["acquaintances", "Acquaintances"]
            ] as Array<[ContactFilter, string]>).map(([key, label]) => (
              <button
                aria-pressed={filter === key}
                className={filter === key ? "btn-primary px-4 py-2" : "btn-secondary px-4 py-2"}
                key={key}
                onClick={() => setFilter(key)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {error ? <p className="mt-4 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100" role="alert">{error}</p> : null}
      </section>

      {visibleContacts.length > 0 ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleContacts.map((contact) => (
            <article className="surface rounded-md p-4" key={contact.id}>
              <div className="flex items-start gap-3">
                <ContactAvatarLink contact={contact} />
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-[var(--gold)]">
                    <Link className="profile-inline-link" href={`/profile/${contact.username}`}>
                      {contact.displayName}
                    </Link>
                  </h2>
                  <p className="text-sm text-[var(--muted)]">
                    <Link className="profile-inline-link" href={`/profile/${contact.username}`}>
                      @{contact.username}
                    </Link>
                  </p>
                  {contact.location ? <p className="mt-1 text-sm text-[var(--muted)]">{contact.location}</p> : null}
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gold)]">{relationshipText(contact)}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn-primary px-4 py-2" disabled={isPending} onClick={() => startChat(contact.id)} type="button">
                  Chat
                </button>
                <Link className="btn-secondary px-4 py-2" href={`/profile/${contact.username}`}>
                  Stream
                </Link>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="surface rounded-md p-8 text-center">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">No contacts found</h2>
          <p className="mt-2 text-[var(--muted)]">Add family, friends, or acquaintances from the member directory.</p>
          <Link className="btn-primary mt-5 inline-flex" href="/people">
            Find Members
          </Link>
        </section>
      )}
    </div>
  );
}
