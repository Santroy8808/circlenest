"use client";

import { AdDestinationKind, EventRsvpStatus, EventStatus, InterestCategory } from "@prisma/client";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { EventDetailView } from "@/modules/events/types";

function eventTimeLabel(startsAt: string, endsAt?: string | null) {
  const startLabel = new Date(startsAt).toLocaleString();
  if (!endsAt) return startLabel;
  return `${startLabel} - ${new Date(endsAt).toLocaleTimeString()}`;
}

export function EventDetailClient({ event: initialEvent }: { event: EventDetailView }) {
  const [event, setEvent] = useState(initialEvent);
  const [inviteIdentifier, setInviteIdentifier] = useState("");
  const [moderatorIdentifier, setModeratorIdentifier] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function updateRsvp(status: EventRsvpStatus) {
    setError("");
    setMessage("");

    startTransition(async () => {
      const response = await fetch(`/api/events/${event.slug}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not update RSVP.");
        return;
      }

      setEvent((current) => ({ ...current, viewerRsvpStatus: status }));
      setMessage(`RSVP updated to ${status}.`);
    });
  }

  function inviteMember(eventForm: React.FormEvent<HTMLFormElement>) {
    eventForm.preventDefault();
    setError("");
    setMessage("");

    startTransition(async () => {
      const response = await fetch(`/api/events/${event.slug}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: inviteIdentifier })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not invite member.");
        return;
      }

      setInviteIdentifier("");
      setMessage("Invitation sent.");
    });
  }

  function addModerator(eventForm: React.FormEvent<HTMLFormElement>) {
    eventForm.preventDefault();
    setError("");
    setMessage("");

    startTransition(async () => {
      const response = await fetch(`/api/events/${event.slug}/moderators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: moderatorIdentifier })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not add moderator.");
        return;
      }

      setModeratorIdentifier("");
      setMessage("Moderator added.");
    });
  }

  function cancelEvent() {
    setError("");
    setMessage("");

    startTransition(async () => {
      const response = await fetch(`/api/events/${event.slug}/cancel`, {
        method: "POST"
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not cancel event.");
        return;
      }

      setEvent((current) => ({ ...current, status: EventStatus.CANCELED }));
      setMessage("Event canceled.");
    });
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">{event.status}</p>
            <h1 className="mt-3 text-4xl font-semibold">{event.title}</h1>
            <p className="mt-3 text-[var(--muted)]">{eventTimeLabel(event.startsAt, event.endsAt)}</p>
            <p className="mt-2 text-[var(--muted)]">{event.locationName || "Location TBD"}</p>
          </div>
          <Link className="btn-secondary" href="/events">
            Back to events
          </Link>
        </div>
        {event.summary ? <p className="mt-5 text-xl leading-8 text-[var(--text)]">{event.summary}</p> : null}
        {event.description ? <p className="mt-4 whitespace-pre-wrap leading-7 text-[var(--muted)]">{event.description}</p> : null}
        {event.address ? <p className="mt-4 rounded-md border border-[var(--line)] p-3 text-sm text-[var(--muted)]">{event.address}</p> : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="surface rounded-md p-5">
          <h2 className="text-xl font-semibold text-[var(--gold)]">RSVP</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Current: {event.viewerRsvpStatus ?? "No response yet"}</p>
          {event.viewerCanRsvp ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {[EventRsvpStatus.GOING, EventRsvpStatus.MAYBE, EventRsvpStatus.DECLINED].map((status) => (
                <button className="btn-secondary px-3 py-2 text-sm" disabled={isPending} key={status} onClick={() => updateRsvp(status)} type="button">
                  {status}
                </button>
              ))}
            </div>
          ) : null}
        </article>

        <article className="surface rounded-md p-5">
          <h2 className="text-xl font-semibold text-[var(--gold)]">Promotion</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Promoting an event creates a normal ad campaign. Ads do not appear inside this event listing.
          </p>
          <Link
            className="btn-secondary mt-4 inline-block"
            href={`/ads/create?destinationKind=${AdDestinationKind.EXTERNAL_URL}&customDestinationUrl=${encodeURIComponent(`/events/${event.slug}`)}&title=${encodeURIComponent(`Promote ${event.title}`)}&body=${encodeURIComponent(event.summary ?? `Join ${event.title} on Theta-Space.`)}&targetInterestCategories=${InterestCategory.EVENTS}`}
          >
            Create event ad
          </Link>
        </article>

        <article className="surface rounded-md p-5">
          <h2 className="text-xl font-semibold text-[var(--gold)]">Host</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">{event.creator?.displayName ?? "Unknown creator"}</p>
          <p className="mt-2 text-sm text-[var(--muted)]">{event.attendeeCount} RSVP records</p>
        </article>
      </section>

      {message ? <p className="surface rounded-md p-3 text-sm text-[var(--gold)]">{message}</p> : null}
      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}

      {event.viewerCanInvite ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <form className="surface grid gap-3 rounded-md p-5" onSubmit={inviteMember}>
            <h2 className="text-xl font-semibold text-[var(--gold)]">Invite member</h2>
            <p className="text-sm leading-6 text-[var(--muted)]">Search by username, email, or display name. Invitations live with the event.</p>
            <input
              className="form-field"
              onChange={(inputEvent) => setInviteIdentifier(inputEvent.target.value)}
              placeholder="jules, jules@theta-space.net, or Jules"
              value={inviteIdentifier}
            />
            <button className="btn-primary send-logo-button justify-self-end" disabled={isPending || inviteIdentifier.trim().length < 2} type="submit">
              <span aria-hidden="true" className="send-logo-icon" />
              <span className="sr-only">Send invite</span>
            </button>
          </form>

          <form className="surface grid gap-3 rounded-md p-5" onSubmit={addModerator}>
            <h2 className="text-xl font-semibold text-[var(--gold)]">Add event moderator</h2>
            <p className="text-sm leading-6 text-[var(--muted)]">Scoped moderators can manage this event without becoming site moderators.</p>
            <input
              className="form-field"
              onChange={(inputEvent) => setModeratorIdentifier(inputEvent.target.value)}
              placeholder="Member username, email, or display name"
              value={moderatorIdentifier}
            />
            <button className="btn-primary justify-self-end" disabled={isPending || moderatorIdentifier.trim().length < 2} type="submit">
              Add moderator
            </button>
          </form>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="surface rounded-md p-5">
          <h2 className="text-xl font-semibold text-[var(--gold)]">Moderators</h2>
          <div className="mt-4 grid gap-3">
            {event.moderators.map((moderator) => (
              <div className="group-member-row" key={`${moderator.id}-${moderator.role}`}>
                <span className="group-member-avatar">{moderator.displayName.slice(0, 2).toUpperCase()}</span>
                <span>
                  <span className="block font-semibold">{moderator.displayName}</span>
                  <span className="text-sm text-[var(--muted)]">{moderator.role}</span>
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="surface rounded-md p-5">
          <h2 className="text-xl font-semibold text-[var(--gold)]">Invitations</h2>
          <div className="mt-4 grid gap-3">
            {event.invitees.length === 0 ? <p className="text-sm text-[var(--muted)]">No invitees yet.</p> : null}
            {event.invitees.map((invitee) => (
              <div className="group-member-row" key={invitee.id}>
                <span className="group-member-avatar">{invitee.displayName.slice(0, 2).toUpperCase()}</span>
                <span>
                  <span className="block font-semibold">{invitee.displayName}</span>
                  <span className="text-sm text-[var(--muted)]">{invitee.status}</span>
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>

      {event.canManage && event.status === EventStatus.PUBLISHED ? (
        <section className="surface rounded-md p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-[var(--gold)]">Event controls</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">Canceling preserves the record and prevents normal RSVP changes.</p>
            </div>
            <button className="btn-secondary" disabled={isPending} onClick={cancelEvent} type="button">
              Cancel event
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
