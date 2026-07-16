"use client";

import { GroupJoinPolicy, GroupVisibility } from "@prisma/client";
import { useState, useTransition } from "react";

export function CreateGroupForm() {
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<GroupVisibility>(GroupVisibility.PUBLIC);
  const [joinPolicy, setJoinPolicy] = useState<GroupJoinPolicy>(GroupJoinPolicy.OPEN);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function submitGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      try {
        const response = await fetch("/api/groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            tagline,
            description,
            visibility,
            joinPolicy
          })
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string; group?: { slug: string } };

        if (!response.ok || !payload.group) {
          setError(payload.error ?? `Could not create group (HTTP ${response.status}).`);
          return;
        }

        window.location.href = `/groups/${payload.group.slug}`;
      } catch {
        setError("Could not reach Theta-Space. Check your connection and try again.");
      }
    });
  }

  return (
    <form className="surface grid gap-5 rounded-md p-6" onSubmit={submitGroup}>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Create Group</p>
        <h1 className="mt-3 text-3xl font-semibold">Set up the group profile</h1>
        <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
          Start with a name and who can find the group. You can add members and open discussions after creation.
        </p>
      </div>

      <label className="grid gap-2">
        <span className="form-label">Group name</span>
        <input className="form-field" onChange={(event) => setName(event.target.value)} value={name} />
      </label>
      <label className="grid gap-2">
        <span className="form-label">Tagline</span>
        <input
          className="form-field"
          onChange={(event) => setTagline(event.target.value)}
          placeholder="One short line that tells members what this group is for."
          value={tagline}
        />
      </label>
      <label className="grid gap-2">
        <span className="form-label">Description</span>
        <textarea
          className="form-field min-h-36 resize-y"
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Describe the group's purpose, standards, and who should join."
          value={description}
        />
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="form-label">Visibility</span>
          <select
            className="form-field"
            onChange={(event) => {
              const nextVisibility = event.target.value as GroupVisibility;
              setVisibility(nextVisibility);
              if (nextVisibility === GroupVisibility.PRIVATE) setJoinPolicy(GroupJoinPolicy.APPROVAL);
            }}
            value={visibility}
          >
            <option value={GroupVisibility.PUBLIC}>Public — members can discover it</option>
            <option value={GroupVisibility.PRIVATE}>Private — added members only</option>
          </select>
        </label>
        <label className="grid gap-2">
          <span className="form-label">Join policy</span>
          <select
            className="form-field"
            disabled={visibility === GroupVisibility.PRIVATE}
            onChange={(event) => setJoinPolicy(event.target.value as GroupJoinPolicy)}
            value={joinPolicy}
          >
            <option value={GroupJoinPolicy.OPEN}>Any member can join</option>
            <option value={GroupJoinPolicy.APPROVAL}>
              {visibility === GroupVisibility.PRIVATE ? "Members are added by a moderator" : "A moderator approves each request"}
            </option>
          </select>
        </label>
      </div>

      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
      <div className="flex justify-end gap-3">
        <a className="btn-secondary" href="/groups">
          Cancel
        </a>
        <button className="btn-primary" disabled={isPending || name.trim().length < 2} type="submit">
          {isPending ? "Creating..." : "Create group"}
        </button>
      </div>
    </form>
  );
}
