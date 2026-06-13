"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type GroupIndexRow = {
  id: string;
  name: string;
  description: string | null;
  purpose: string | null;
  locationCountry: string | null;
  locationState: string | null;
  locationCity: string | null;
  visibility: string;
  joinMode: "OPEN" | "REQUEST";
  ownerUsername: string;
  memberCount: number;
  isMember: boolean;
  hasPendingRequest: boolean;
};

export function GroupsIndexClient({ groups, emptyMessage = "No groups found." }: { groups: GroupIndexRow[]; emptyMessage?: string }) {
  const router = useRouter();
  const [statusByGroup, setStatusByGroup] = useState<Record<string, string>>({});

  async function join(groupId: string) {
    setStatusByGroup((prev) => ({ ...prev, [groupId]: "Working..." }));
    const res = await fetch(`/api/groups/${groupId}/join`, { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { status?: string; error?: string };
    if (!res.ok) {
      setStatusByGroup((prev) => ({ ...prev, [groupId]: body.error ?? "Could not process join." }));
      return;
    }
    setStatusByGroup((prev) => ({
      ...prev,
      [groupId]: body.status === "REQUESTED" ? "Join request sent." : "You joined this group.",
    }));
    router.refresh();
  }

  return (
    <section className="grid gap-3">
      {groups.length ? groups.map((g) => (
        <article key={g.id} className="card p-4">
          <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{g.name}</h2>
            <p className="text-sm text-slate-600">{g.description || "No description"}</p>
          </div>
          <Link href={`/groups/${g.id}`} className="rounded bg-blue-600 px-3 py-2 text-sm text-white">
            Open Group
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
          <span>{g.visibility}</span>
          <span>{g.memberCount} members</span>
          <span>Creator: @{g.ownerUsername}</span>
          <span>{g.joinMode === "OPEN" ? "Open join" : "Request to join"}</span>
          <span>Purpose: {g.purpose || "Not set"}</span>
          <span>
            Location: {[g.locationCity, g.locationState, g.locationCountry].filter(Boolean).join(", ") || "Not set"}
          </span>
        </div>
          <div className="mt-3 flex items-center gap-3">
            {g.isMember ? (
              <span className="text-xs text-emerald-700">You are a member.</span>
            ) : g.hasPendingRequest ? (
              <span className="text-xs text-amber-700">Join request pending.</span>
            ) : (
              <button className="rounded border border-slate-300 px-3 py-1.5 text-sm" onClick={() => void join(g.id)}>
                {g.joinMode === "OPEN" ? "Join Group" : "Request to Join"}
              </button>
            )}
            {statusByGroup[g.id] ? <span className="text-xs text-slate-600">{statusByGroup[g.id]}</span> : null}
          </div>
        </article>
      )) : <p className="rounded border border-dashed border-slate-300 p-4 text-sm text-slate-600">{emptyMessage}</p>}
    </section>
  );
}

