"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { ForumThreadCard, type ForumThreadCardData } from "@/components/groups/forum-thread-card";
import { ReportControl } from "@/components/reports/report-control";

type DirectoryGroupRow = {
  id: string;
  name: string;
  description: string | null;
  purpose: string | null;
  visibility: string;
  joinMode: "OPEN" | "REQUEST";
  ownerUsername: string;
  memberCount: number;
  isMember: boolean;
  hasPendingRequest: boolean;
  createdAt: string;
  lastActivityAt: string | null;
};

type SelectedGroupData = {
  id: string;
  name: string;
  description: string | null;
  visibility: string;
  ownerId: string;
  ownerUsername: string;
  memberCount: number;
  isMember: boolean;
  currentRole: string | null;
  thread: ForumThreadCardData | null;
};

type GroupsCenterClientProps = {
  directoryGroups: DirectoryGroupRow[];
  selectedGroup: SelectedGroupData | null;
  selectedGroupId: string | null;
  view: "joined" | "my";
  sort: "active" | "newest" | "members";
  query: string;
  purpose: string;
  country: string;
  state: string;
  city: string;
  maxCreatedGroupMembers: number | null;
  currentUserId: string;
};

type CreateGroupFormState = {
  name: string;
  purpose: string;
  locationCountry: string;
  locationState: string;
  locationCity: string;
  description: string;
  visibility: "PUBLIC" | "PRIVATE";
  joinMode: "OPEN" | "REQUEST";
};

const initialCreateGroupState: CreateGroupFormState = {
  name: "",
  purpose: "",
  locationCountry: "",
  locationState: "",
  locationCity: "",
  description: "",
  visibility: "PUBLIC",
  joinMode: "OPEN",
};

function formatActivity(value: string | null): string {
  if (!value) return "just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  const diffMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function GroupsCenterClient({
  directoryGroups,
  selectedGroup,
  selectedGroupId,
  view,
  sort,
  query,
  purpose,
  country,
  state,
  city,
  maxCreatedGroupMembers,
  currentUserId,
}: GroupsCenterClientProps) {
  const router = useRouter();
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [createStatus, setCreateStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<CreateGroupFormState>(initialCreateGroupState);
  const isMyGroupsView = view === "my";

  const sortedGroups = useMemo(() => directoryGroups, [directoryGroups]);
  const searchHrefBase = useMemo(() => {
    const params = new URLSearchParams();
    if (view === "my") params.set("view", "my");
    if (selectedGroupId) params.set("selected", selectedGroupId);
    if (query) params.set("q", query);
    if (purpose) params.set("purpose", purpose);
    if (country) params.set("country", country);
    if (state) params.set("state", state);
    if (city) params.set("city", city);
    if (sort && sort !== "active") params.set("sort", sort);
    const suffix = params.toString();
    return suffix ? `?${suffix}` : "/groups";
  }, [city, country, query, purpose, selectedGroupId, sort, state, view]);

  async function submitCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setCreateStatus("");
    try {
      const response = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; id?: string };
      if (!response.ok) {
        setCreateStatus(payload.error ?? "Could not create group.");
        return;
      }
      setCreateStatus("Group created.");
      setShowCreateGroup(false);
      setCreateForm(initialCreateGroupState);
      router.push(`/groups?view=my&selected=${encodeURIComponent(payload.id ?? "")}`);
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  async function toggleMembership(action: "join" | "leave", groupId: string) {
    const response = await fetch(`/api/groups/${groupId}/${action}`, { method: "POST" });
    if (!response.ok) return;
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-[680px] space-y-4 overflow-x-hidden">
      <section className="rounded-[18px] border border-[var(--border)] bg-[#0f1523] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{isMyGroupsView ? "My Groups" : "Groups"}</p>
            <h1 className="text-2xl font-semibold text-[var(--text-strong)]">{selectedGroup?.name ?? (isMyGroupsView ? "My Groups" : "Groups")}</h1>
            <p className="mt-1 text-sm text-slate-400">
              {selectedGroup?.description ?? (isMyGroupsView ? "Groups you created, moderate, or keep active." : "Browse groups, then open a discussion below.")}
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-amber-200">{selectedGroup?.visibility ?? "PUBLIC"} · {selectedGroup?.memberCount ?? 0} members</p>
          </div>
          {selectedGroup ? (
            <div className="flex items-center gap-2">
              {!selectedGroup.isMember ? (
                <button type="button" className="rounded-full bg-[#376ef8] px-4 py-2 text-sm font-semibold text-white" onClick={() => void toggleMembership("join", selectedGroup.id)}>
                  Join
                </button>
              ) : selectedGroup.ownerId !== currentUserId ? (
                <button type="button" className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-slate-200" onClick={() => void toggleMembership("leave", selectedGroup.id)}>
                  Leave
                </button>
              ) : null}
              <ReportControl targetType="GROUP" targetId={selectedGroup.id} label="Report" compact />
              <button type="button" className="rounded-full border border-[var(--border)] px-3 py-2 text-sm text-slate-300" aria-label="More group actions">
                ...
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-[16px] border border-[var(--border)] bg-[#0f1523] p-3">
        <div className="flex flex-wrap gap-2">
          <Link
            href="/groups"
            className={`rounded-full px-4 py-2 text-sm transition ${!isMyGroupsView ? "bg-[#376ef8] font-semibold text-white" : "border border-[#304058] text-slate-200 hover:border-[#4a5a78]"}`}
          >
            Joined Groups
          </Link>
          <Link
            href="/groups?view=my"
            className={`rounded-full px-4 py-2 text-sm transition ${isMyGroupsView ? "bg-[#376ef8] font-semibold text-white" : "border border-[#304058] text-slate-200 hover:border-[#4a5a78]"}`}
          >
            My Groups
          </Link>
        </div>
      </section>

      <section className="rounded-[18px] border border-[var(--border)] bg-[#0f1523] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-strong)]">{isMyGroupsView ? "My Groups" : "Groups"}</h2>
            <p className="text-sm text-slate-400">
              {isMyGroupsView ? "Sort the groups you run or moderate, then jump into the selected discussion." : "Search the directory, sort by activity, and choose a group to read."}
            </p>
          </div>
          <button
            type="button"
            className="rounded-full bg-[#376ef8] px-4 py-2 text-sm font-semibold text-white"
            onClick={() => setShowCreateGroup((previous) => !previous)}
          >
            Create Group
          </button>
        </div>

        <form action="/groups" method="get" className="mt-3 space-y-3">
          <input type="hidden" name="view" value={view === "my" ? "my" : "joined"} />
          {selectedGroupId ? <input type="hidden" name="selected" value={selectedGroupId} /> : null}
          <div className="grid gap-2 md:grid-cols-[1.4fr_1.4fr_auto]">
            <input name="q" defaultValue={query} placeholder={isMyGroupsView ? "Search my groups..." : "Search groups..."} className="rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400" />
            <select name="sort" defaultValue={sort} className="rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100" onChange={(event) => event.currentTarget.form?.requestSubmit()}>
              <option value="active">Active</option>
              <option value="newest">Newest</option>
              <option value="members">Members</option>
            </select>
            <button type="submit" className="rounded-[10px] border border-[#304058] px-3 py-2 text-sm text-slate-200">
              Search
            </button>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <input name="purpose" defaultValue={purpose} placeholder="Purpose" className="rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400" />
            <input name="country" defaultValue={country} placeholder="Country" className="rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400" />
            <input name="state" defaultValue={state} placeholder="State" className="rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400" />
          </div>
          <input name="city" defaultValue={city} placeholder="City" className="w-full rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400" />
          <div className="flex items-center gap-2">
            <button type="submit" className="rounded-full bg-[#376ef8] px-4 py-2 text-sm font-semibold text-white">
              {isMyGroupsView ? "Search my groups" : "Search groups"}
            </button>
            <Link href={searchHrefBase.split("?")[0]} className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-slate-200">
              Clear
            </Link>
          </div>
        </form>

        {showCreateGroup ? (
          <form onSubmit={(event) => void submitCreateGroup(event)} className="mt-4 space-y-3 rounded-[14px] border border-[#2e3c55] bg-[#111a2a] p-3">
            <div className="grid gap-2 md:grid-cols-2">
              <input value={createForm.name} onChange={(event) => setCreateForm((previous) => ({ ...previous, name: event.target.value }))} placeholder="Group name" className="rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400" required />
              <input value={createForm.purpose} onChange={(event) => setCreateForm((previous) => ({ ...previous, purpose: event.target.value }))} placeholder="Purpose" className="rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400" required />
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <input value={createForm.locationCountry} onChange={(event) => setCreateForm((previous) => ({ ...previous, locationCountry: event.target.value }))} placeholder="Country" className="rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400" required />
              <input value={createForm.locationState} onChange={(event) => setCreateForm((previous) => ({ ...previous, locationState: event.target.value }))} placeholder="State" className="rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400" required />
              <input value={createForm.locationCity} onChange={(event) => setCreateForm((previous) => ({ ...previous, locationCity: event.target.value }))} placeholder="City" className="rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400" required />
            </div>
            <textarea value={createForm.description} onChange={(event) => setCreateForm((previous) => ({ ...previous, description: event.target.value }))} placeholder="Group description" className="min-h-24 w-full rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400" />
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
              <select value={createForm.visibility} onChange={(event) => setCreateForm((previous) => ({ ...previous, visibility: event.target.value as "PUBLIC" | "PRIVATE" }))} className="rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100">
                <option value="PUBLIC">Public</option>
                <option value="PRIVATE">Private</option>
              </select>
              <select value={createForm.joinMode} onChange={(event) => setCreateForm((previous) => ({ ...previous, joinMode: event.target.value as "OPEN" | "REQUEST" }))} className="rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100">
                <option value="OPEN">Open join</option>
                <option value="REQUEST">Request to join</option>
              </select>
              <button type="submit" className="rounded-full bg-[#376ef8] px-4 py-2 text-sm font-semibold text-white" disabled={creating}>
                {creating ? "Creating..." : "Create Group"}
              </button>
            </div>
            {maxCreatedGroupMembers ? <p className="text-xs text-amber-200">Groups you create are capped at {maxCreatedGroupMembers} members.</p> : null}
            {createStatus ? <p className="text-xs text-slate-300">{createStatus}</p> : null}
          </form>
        ) : null}

        <div className="mt-4 space-y-2">
          {sortedGroups.length ? (
            sortedGroups.map((group) => {
              const selected = group.id === selectedGroupId;
              return (
                <Link
                  key={group.id}
                  href={`/groups?${new URLSearchParams({
                    ...(view === "my" ? { view: "my" } : {}),
                    ...(selectedGroupId ? { selected: group.id } : { selected: group.id }),
                    ...(query ? { q: query } : {}),
                    ...(purpose ? { purpose } : {}),
                    ...(country ? { country } : {}),
                    ...(state ? { state } : {}),
                    ...(city ? { city } : {}),
                    ...(sort ? { sort } : {}),
                  }).toString()}`}
                  className={`block rounded-[14px] border px-3 py-3 transition ${
                    selected
                      ? "border-[#d6c26d]/50 bg-[#162033] shadow-[inset_3px_0_0_#d6c26d]"
                      : "border-[#273449] bg-[#111a2a] hover:border-[#3b4f6c]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--text-strong)]">{group.name}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{group.description || "No description"}</p>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-amber-200">
                        {group.memberCount} members · {formatActivity(group.lastActivityAt)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-[11px] text-slate-400">
                      <p>{group.visibility}</p>
                      <p>{group.joinMode === "OPEN" ? "Open join" : "Request"}</p>
                    </div>
                  </div>
                </Link>
              );
            })
          ) : (
            <p className="rounded-[14px] border border-dashed border-[#2d3b52] bg-[#111a2a] p-4 text-sm text-slate-400">
              {isMyGroupsView ? "No groups in your managed list match that search." : "No groups match that search."}
            </p>
          )}
        </div>
      </section>

      <section className="rounded-[18px] border border-[var(--border)] bg-[#0f1523] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-strong)]">Selected group discussion</h2>
            <p className="text-sm text-slate-400">Read the latest thread and reply below.</p>
          </div>
          {selectedGroup ? (
            <div className="flex items-center gap-2">
              <p className="text-xs uppercase tracking-[0.18em] text-amber-200">{selectedGroup.thread ? "Thread ready" : "No thread yet"}</p>
              <Link
                href={`/groups/${selectedGroup.id}`}
                className="rounded-full border border-[#304058] px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-[#4a5a78] hover:text-white"
              >
                Open group
              </Link>
            </div>
          ) : null}
        </div>

        <div className="mt-3">
          {selectedGroup?.thread ? (
            <ForumThreadCard groupId={selectedGroup.id} thread={selectedGroup.thread} isMember={selectedGroup.isMember} />
          ) : (
            <p className="rounded-[14px] border border-dashed border-[#2d3b52] bg-[#111a2a] p-4 text-sm text-slate-400">Select a group to view its discussion.</p>
          )}
        </div>
      </section>
    </div>
  );
}
