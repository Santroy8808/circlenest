"use client";

import Link from "next/link";
import { useState } from "react";
import type { EventCardView } from "@/modules/events/types";

function eventTimeLabel(startsAt: string, endsAt?: string | null) {
  const start = new Date(startsAt);
  const startLabel = start.toLocaleString();
  if (!endsAt) return startLabel;
  return `${startLabel} - ${new Date(endsAt).toLocaleTimeString()}`;
}

function readableStatus(status: string) {
  const label = status.toLowerCase().replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function EventsDirectoryClient({
  initialEvents,
  viewerCanCreate
}: {
  initialEvents: EventCardView[];
  viewerCanCreate: boolean;
}) {
  const [events] = useState(initialEvents);
  const [query, setQuery] = useState("");
  const visibleEvents = events.filter((event) => {
    const haystack = [event.title, event.summary, event.locationName].join(" ").toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Community Events</p>
            <h1 className="mt-3 text-3xl font-semibold">Events</h1>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
              See events you created, help manage, joined, or were invited to.
            </p>
          </div>
          {viewerCanCreate ? (
            <Link className="btn-primary" href="/events/create">
              Create Event
            </Link>
          ) : null}
        </div>
        <input className="form-field mt-6" onChange={(event) => setQuery(event.target.value)} placeholder="Search events..." value={query} />
      </section>

      {visibleEvents.length === 0 ? (
        <section className="surface rounded-md p-8 text-center">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">No events here yet</h2>
          <p className="mt-2 text-[var(--muted)]">
            {viewerCanCreate ? "Create an event or invite members when you are ready." : "Events appear here when someone invites you."}
          </p>
        </section>
      ) : (
        <section className="grid gap-4">
          {visibleEvents.map((event) => (
            <Link className="event-card" href={`/events/${event.slug}`} key={event.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">{readableStatus(event.status)}</p>
                  <h2 className="mt-2 truncate text-2xl font-semibold">{event.title}</h2>
                  <p className="mt-2 text-sm text-[var(--muted)]">{eventTimeLabel(event.startsAt, event.endsAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {event.canManage ? <span className="pill rounded-full px-3 py-1 text-xs">Manage</span> : null}
                  {event.viewerRsvpStatus ? <span className="pill rounded-full px-3 py-1 text-xs">{readableStatus(event.viewerRsvpStatus)}</span> : null}
                </div>
              </div>
              <p className="mt-4 line-clamp-2 leading-7 text-[var(--muted)]">{event.summary || "No summary yet."}</p>
              <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[var(--gold)]">
                {event.locationName || "Location TBD"} - {event.attendeeCount} RSVP
              </p>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
