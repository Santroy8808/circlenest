"use client";

import Link from "next/link";
import { useState } from "react";
import { SocialRelationshipType } from "@prisma/client";
import { ListingViewSwitcher } from "@/components/listings/listing-view-switcher";
import type { ListingPreferenceSurface, ListingViewMode } from "@/modules/listing-preferences/types";
import { FamilyTagButton } from "@/components/social/family-tag-button";
import type { PeopleCardView } from "@/modules/social-graph/types";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function relationshipLabel(relationship: SocialRelationshipType) {
  if (relationship === SocialRelationshipType.ACQUAINTANCE) return "Acquaintance";
  return relationship.charAt(0) + relationship.slice(1).toLowerCase();
}

function AcquaintanceButton({ person }: { person: PeopleCardView }) {
  const [relationships, setRelationships] = useState(person.relationships);
  const [isSaving, setIsSaving] = useState(false);
  const isAcquaintance = relationships.includes(SocialRelationshipType.ACQUAINTANCE);

  async function markAcquaintance() {
    setIsSaving(true);
    try {
      const response = await fetch("/api/social-graph/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toUserId: person.id,
          type: SocialRelationshipType.ACQUAINTANCE
        })
      });

      if (response.ok) {
        setRelationships((current) =>
          current.includes(SocialRelationshipType.ACQUAINTANCE) ? current : [...current, SocialRelationshipType.ACQUAINTANCE]
        );
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <button className="btn-secondary family-action-button" disabled={isSaving || isAcquaintance} onClick={markAcquaintance} type="button">
      {isAcquaintance ? "Acquaintance" : isSaving ? "Saving..." : "Acquaintance"}
    </button>
  );
}

export function PeopleGrid({
  initialView,
  people,
  surface
}: {
  initialView: ListingViewMode;
  people: PeopleCardView[];
  surface: Extract<ListingPreferenceSurface, "people" | "friends">;
}) {
  const [view, setView] = useState<ListingViewMode>(initialView);

  if (people.length === 0) {
    return (
      <section className="surface rounded-md p-6 text-center">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">No people yet</h2>
        <p className="mt-2 text-[var(--muted)]">No matching people were found.</p>
      </section>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="listing-toolbar">
        <p className="text-sm text-[var(--muted)]">{people.length} visible</p>
        <ListingViewSwitcher onChange={setView} surface={surface} value={view} />
      </div>
      <section className={`people-grid people-grid--${view}`}>
        {people.map((person) => (
          <article className={`people-card people-card--${view}`} key={person.id}>
            <Link className="people-card-link" href={`/profile/${person.username}`}>
              {view !== "compact" ? (
                <div className="people-avatar">
                  {person.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" decoding="async" fetchPriority="low" loading="lazy" src={person.avatarUrl} />
                  ) : (
                    <span>{initials(person.displayName) || "TS"}</span>
                  )}
                </div>
              ) : null}
              <div className="people-card-copy">
                <h2 className="mt-3 text-lg font-semibold">{person.displayName}</h2>
                <p className="people-full-name mt-1 text-sm text-[var(--muted)]">Full name: {person.fullName}</p>
                <p className="people-username text-sm text-[var(--muted)]">@{person.username}</p>
                {person.location ? <p className="people-location mt-1 text-sm text-[var(--muted)]">{person.location}</p> : null}
                <div className="people-relationship-pills mt-3 flex flex-wrap justify-center gap-2">
                  {person.relationships.map((relationship) => (
                    <span className="pill rounded-full px-2 py-1 text-[11px] font-semibold" key={relationship}>
                      {relationshipLabel(relationship)}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
            <div className="people-family-action">
              <FamilyTagButton
                disabled={person.pendingFamilyRequest}
                existingLabel={person.relationships.includes(SocialRelationshipType.FAMILY) ? person.familyLabel ?? "Family" : null}
                targetUserId={person.id}
              />
              <AcquaintanceButton person={person} />
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
