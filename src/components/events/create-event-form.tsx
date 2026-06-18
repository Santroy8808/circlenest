"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

export function CreateEventForm() {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [locationName, setLocationName] = useState("");
  const [address, setAddress] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function submitEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          summary,
          description,
          locationName,
          address,
          startsAt,
          endsAt
        })
      });
      const payload = (await response.json()) as { error?: string; event?: { slug: string } };

      if (!response.ok || !payload.event) {
        setError(payload.error ?? "Could not create event.");
        return;
      }

      window.location.href = `/events/${payload.event.slug}`;
    });
  }

  return (
    <form className="surface grid gap-5 rounded-md p-6" onSubmit={submitEvent}>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Create Event</p>
        <h1 className="mt-3 text-3xl font-semibold">Set up the invitation shell</h1>
        <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
          Create the event first. Invites, moderators, RSVP, and promotion are managed from the event detail page.
        </p>
      </div>

      <label className="grid gap-2">
        <span className="form-label">Event title</span>
        <input className="form-field" onChange={(event) => setTitle(event.target.value)} value={title} />
      </label>

      <label className="grid gap-2">
        <span className="form-label">Short summary</span>
        <input
          className="form-field"
          onChange={(event) => setSummary(event.target.value)}
          placeholder="One line people can understand quickly."
          value={summary}
        />
      </label>

      <label className="grid gap-2">
        <span className="form-label">Description</span>
        <textarea
          className="form-field min-h-36 resize-y"
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What is happening, who it is for, and what they should know."
          value={description}
        />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="form-label">Starts</span>
          <input className="form-field" onChange={(event) => setStartsAt(event.target.value)} type="datetime-local" value={startsAt} />
        </label>
        <label className="grid gap-2">
          <span className="form-label">Ends</span>
          <input className="form-field" onChange={(event) => setEndsAt(event.target.value)} type="datetime-local" value={endsAt} />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="form-label">Location name</span>
          <input className="form-field" onChange={(event) => setLocationName(event.target.value)} value={locationName} />
        </label>
        <label className="grid gap-2">
          <span className="form-label">Address or access notes</span>
          <input className="form-field" onChange={(event) => setAddress(event.target.value)} value={address} />
        </label>
      </div>

      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}

      <div className="flex justify-end gap-3">
        <Link className="btn-secondary" href="/events">
          Cancel
        </Link>
        <button className="btn-primary" disabled={isPending || title.trim().length < 2 || !startsAt} type="submit">
          {isPending ? "Creating..." : "Create event"}
        </button>
      </div>
    </form>
  );
}
