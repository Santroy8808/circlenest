import { Prisma } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { GroupsIndexClient } from "@/components/groups/groups-index-client";
import { TierGate } from "@/components/policy/tier-gate";
import { createGroupForUser } from "@/modules/groups/groups.service";
import { getMaxCreatedGroupMembers, resolveUserAccessPolicy } from "@/lib/policy/tier-policy";

type SearchParams = {
  view?: string | string[];
  q?: string | string[];
  purpose?: string | string[];
  country?: string | string[];
  state?: string | string[];
  city?: string | string[];
};

type GroupCardRow = {
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

const groupInclude = {
  owner: { select: { username: true } },
  members: { select: { userId: true, role: true } },
  joinRequests: {
    where: { status: "PENDING" },
    select: { id: true, userId: true },
  },
} satisfies Prisma.GroupInclude;

export default async function GroupsPage({ searchParams }: { searchParams?: SearchParams }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, subscriptionTier: true },
  });
  const policy = resolveUserAccessPolicy(user);

  const view = normalizeView(readParam(searchParams?.view));
  const query = readParam(searchParams?.q);
  const purpose = readParam(searchParams?.purpose);
  const country = readParam(searchParams?.country);
  const state = readParam(searchParams?.state);
  const city = readParam(searchParams?.city);
  const hasSearch = Boolean(query || purpose || country || state || city);

  const [joinedGroups, myGroups, searchedGroups] = await Promise.all([
    view === "my" || hasSearch
      ? []
      : loadGroups({
          members: {
            some: { userId: session.user.id },
          },
        }, session.user.id),
    view === "my"
      ? loadGroups({
          OR: [
            { ownerId: session.user.id },
            {
              members: {
                some: { userId: session.user.id, role: "MODERATOR" },
              },
            },
          ],
        }, session.user.id)
      : [],
    hasSearch
      ? loadGroups(buildSearchWhere({ query, purpose, country, state, city }), session.user.id)
      : [],
  ]);

  const groups = view === "my" ? myGroups : hasSearch ? searchedGroups : joinedGroups;
  const title = view === "my" ? "My Groups" : hasSearch ? "Search Results" : "Joined Groups";
  const description =
    view === "my"
      ? "Groups you created or moderate."
      : hasSearch
        ? "Search by group name, purpose, or location."
        : "Groups you are already in.";

  return (
    <AppShell>
      <div className="space-y-4">
        <CreateGroupCard maxCreatedGroupMembers={getMaxCreatedGroupMembers(policy)} />

        <section className="card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="mb-1 text-xl font-semibold">{title}</h1>
              <p className="text-sm text-slate-600">{description}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/groups" className={`rounded border px-3 py-2 text-sm ${view === "my" ? "border-slate-300" : "border-slate-900 bg-slate-900 text-white"}`}>
                Joined Groups
              </Link>
              <Link href="/groups?view=my" className={`rounded border px-3 py-2 text-sm ${view === "my" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}>
                My Groups
              </Link>
            </div>
          </div>

          {view !== "my" ? (
            <form action="/groups" method="get" className="mt-4 rounded border border-[var(--border)] p-3">
              <p className="mb-2 text-sm font-medium">Find a group</p>
              <div className="grid gap-2 md:grid-cols-2">
                <input name="q" defaultValue={query} placeholder="Group name" className="rounded border border-slate-300 px-3 py-2" />
                <input name="purpose" defaultValue={purpose} placeholder="Purpose" className="rounded border border-slate-300 px-3 py-2" />
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                <input name="country" defaultValue={country} placeholder="Country" className="rounded border border-slate-300 px-3 py-2" />
                <input name="state" defaultValue={state} placeholder="State" className="rounded border border-slate-300 px-3 py-2" />
                <input name="city" defaultValue={city} placeholder="City" className="rounded border border-slate-300 px-3 py-2" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-white">
                  Search groups
                </button>
                {hasSearch ? (
                  <Link href="/groups" className="rounded border border-slate-300 px-3 py-2 text-sm">
                    Clear search
                  </Link>
                ) : null}
              </div>
            </form>
          ) : null}
        </section>

        <GroupsIndexClient
          groups={groups}
          emptyMessage={
            view === "my"
              ? "You have not created or moderated any groups yet."
              : hasSearch
                ? "No groups match that search."
                : "You are not in any groups yet."
          }
        />
      </div>
    </AppShell>
  );
}

function CreateGroupCard({ maxCreatedGroupMembers }: { maxCreatedGroupMembers: number | null }) {
  return (
    <section className="card p-4">
      <h1 className="mb-2 text-xl font-semibold">Groups</h1>
      <p className="mb-3 text-sm text-slate-600">Create a group with a clear purpose and location.</p>
      <form
        action={async (formData) => {
          "use server";
          const session = await auth();
          if (!session?.user?.id) return;

          const result = await createGroupForUser(session.user.id, {
            name: String(formData.get("name") ?? "").trim(),
            purpose: String(formData.get("purpose") ?? "").trim(),
            locationCountry: String(formData.get("locationCountry") ?? "").trim(),
            locationState: String(formData.get("locationState") ?? "").trim(),
            locationCity: String(formData.get("locationCity") ?? "").trim(),
            description: String(formData.get("description") ?? "").trim(),
            visibility: String(formData.get("visibility") ?? "PUBLIC") === "PRIVATE" ? "PRIVATE" : "PUBLIC",
            joinMode: String(formData.get("joinMode") ?? "OPEN") === "REQUEST" ? "REQUEST" : "OPEN",
          });

          if (!result.ok) return;
          revalidatePath("/groups");
          redirect("/groups?view=my");
        }}
        className="grid gap-2"
      >
        <div className="grid gap-2 md:grid-cols-2">
          <input name="name" placeholder="Group name" className="rounded border border-slate-300 px-3 py-2" required />
          <input name="purpose" placeholder="Purpose" className="rounded border border-slate-300 px-3 py-2" required />
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <input name="locationCountry" placeholder="Country" className="rounded border border-slate-300 px-3 py-2" required />
          <input name="locationState" placeholder="State" className="rounded border border-slate-300 px-3 py-2" required />
          <input name="locationCity" placeholder="City" className="rounded border border-slate-300 px-3 py-2" required />
        </div>
        <input name="description" placeholder="Group description" className="rounded border border-slate-300 px-3 py-2" />
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <select name="visibility" className="rounded border border-slate-300 px-3 py-2">
            <option value="PUBLIC">Public</option>
            <option value="PRIVATE">Private</option>
          </select>
          <select name="joinMode" className="rounded border border-slate-300 px-3 py-2">
            <option value="OPEN">Open join</option>
            <option value="REQUEST">Request to join</option>
          </select>
          <button className="rounded bg-slate-900 px-3 py-2 text-white" type="submit">
            Create
          </button>
        </div>
      </form>
      {maxCreatedGroupMembers ? (
        <div className="mt-3">
          <TierGate
            variant="info"
            title="Free group limit"
            message={`Groups you create are capped at ${maxCreatedGroupMembers} members.`}
            ctaLabel="Compare memberships"
            ctaHref="/membership"
            secondaryLabel="Open subscription"
            secondaryHref="/settings/subscription"
            compact
          />
        </div>
      ) : null}
    </section>
  );
}

function buildSearchWhere(filters: { query: string; purpose: string; country: string; state: string; city: string }): Prisma.GroupWhereInput {
  const and: Prisma.GroupWhereInput[] = [];

  if (filters.query) {
    and.push({
      OR: [
        { name: { contains: filters.query } },
        { purpose: { contains: filters.query } },
        { description: { contains: filters.query } },
      ],
    });
  }

  if (filters.purpose) {
    and.push({ purpose: { contains: filters.purpose } });
  }

  if (filters.country) {
    and.push({ locationCountry: { contains: filters.country } });
  }

  if (filters.state) {
    and.push({ locationState: { contains: filters.state } });
  }

  if (filters.city) {
    and.push({ locationCity: { contains: filters.city } });
  }

  return and.length ? { AND: and } : {};
}

async function loadGroups(where: Prisma.GroupWhereInput, userId: string): Promise<GroupCardRow[]> {
  const groups = await prisma.group.findMany({
    where,
    include: groupInclude,
    orderBy: { createdAt: "desc" },
  });

  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    description: group.description,
    purpose: group.purpose,
    locationCountry: group.locationCountry,
    locationState: group.locationState,
    locationCity: group.locationCity,
    visibility: group.visibility,
    joinMode: group.joinMode === "REQUEST" ? "REQUEST" : "OPEN",
    ownerUsername: group.owner.username,
    memberCount: group.members.length,
    isMember: group.members.some((member) => member.userId === userId),
    hasPendingRequest: group.joinRequests.some((request) => request.userId === userId),
  }));
}

function readParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function normalizeView(value: string): "joined" | "my" {
  return value === "my" ? "my" : "joined";
}
