import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { GroupsCenterClient } from "@/components/groups/groups-center-client";
import { canCreateGroup, getMaxCreatedGroupMembers, resolveUserAccessPolicy } from "@/lib/policy/tier-policy";

type SearchParams = {
  view?: string | string[];
  q?: string | string[];
  purpose?: string | string[];
  country?: string | string[];
  state?: string | string[];
  city?: string | string[];
  sort?: string | string[];
  selected?: string | string[];
};

type GroupCardRow = {
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

const groupInclude = {
  owner: { select: { username: true } },
  members: { select: { userId: true, role: true } },
  joinRequests: {
    where: { status: "PENDING" },
    select: { id: true, userId: true },
  },
  threads: {
    select: {
      createdAt: true,
      updatedAt: true,
    },
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
  const sort = normalizeSort(readParam(searchParams?.sort));
  const requestedSelectedGroupId = readParam(searchParams?.selected);
  const hasSearch = Boolean(query || purpose || country || state || city);

  const [joinedGroups, myGroups, searchedGroups] = await Promise.all([
    view === "my" || hasSearch
      ? []
      : loadGroups(
          {
            members: {
              some: { userId: session.user.id },
            },
          },
          session.user.id,
        ),
    view === "my"
      ? loadGroups(
          {
            OR: [
              { ownerId: session.user.id },
              {
                members: {
                  some: { userId: session.user.id, role: "MODERATOR" },
                },
              },
            ],
          },
          session.user.id,
        )
      : [],
    hasSearch ? loadGroups(buildSearchWhere({ query, purpose, country, state, city }), session.user.id) : [],
  ]);

  const unsortedGroups = view === "my" ? myGroups : hasSearch ? searchedGroups : joinedGroups;
  const groups = sortDirectoryGroups(unsortedGroups, sort);
  const selectedGroupId = requestedSelectedGroupId || groups[0]?.id || null;
  const selectedGroup = selectedGroupId ? await loadSelectedGroup(selectedGroupId, session.user.id) : null;

  return (
    <AppShell>
      <GroupsCenterClient
        directoryGroups={groups}
        selectedGroup={selectedGroup}
        selectedGroupId={selectedGroupId}
        view={view}
        sort={sort}
        query={query}
        purpose={purpose}
        country={country}
        state={state}
        city={city}
        maxCreatedGroupMembers={canCreateGroup(policy) ? getMaxCreatedGroupMembers(policy) : null}
        currentUserId={session.user.id}
      />
    </AppShell>
  );
}

function buildSearchWhere(filters: { query: string; purpose: string; country: string; state: string; city: string }): Prisma.GroupWhereInput {
  const and: Prisma.GroupWhereInput[] = [];

  if (filters.query) {
    and.push({
      OR: [{ name: { contains: filters.query } }, { purpose: { contains: filters.query } }, { description: { contains: filters.query } }],
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
    visibility: group.visibility,
    joinMode: group.joinMode === "REQUEST" ? "REQUEST" : "OPEN",
    ownerUsername: group.owner.username,
    memberCount: group.members.length,
    isMember: group.members.some((member) => member.userId === userId),
    hasPendingRequest: group.joinRequests.some((request) => request.userId === userId),
    createdAt: group.createdAt.toISOString(),
    lastActivityAt: newestActivityAt(group.threads.map((thread) => thread.updatedAt ?? thread.createdAt)),
  }));
}

async function loadSelectedGroup(groupId: string, userId: string) {
  const group = await prisma.group.findFirst({
    where: { id: groupId },
    include: {
      owner: { select: { username: true } },
      members: {
        include: {
          user: { select: { id: true, username: true } },
        },
      },
      threads: {
        include: {
          author: { select: { username: true } },
          posts: { include: { author: { select: { username: true } } }, orderBy: { createdAt: "asc" } },
        },
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  if (!group) return null;

  const myMembership = group.members.find((member) => member.userId === userId) ?? null;
  const thread = group.threads[0];

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    visibility: group.visibility,
    ownerId: group.ownerId,
    ownerUsername: group.owner.username,
    memberCount: group.members.length,
    isMember: Boolean(myMembership),
    currentRole: myMembership?.role ?? null,
    thread: thread
      ? {
          id: thread.id,
          title: thread.title,
          authorUsername: thread.author.username,
          allowReplyImages: thread.allowReplyImages,
          posts: thread.posts.map((post) => ({
            id: post.id,
            content: post.content,
            parentCommentId: post.parentCommentId,
            mediaUrlsJson: post.mediaUrlsJson,
            createdAt: post.createdAt.toISOString(),
            author: { username: post.author.username },
          })),
        }
      : null,
  };
}

function sortDirectoryGroups(groups: GroupCardRow[], sort: "active" | "newest" | "members"): GroupCardRow[] {
  const sorted = [...groups];
  sorted.sort((a, b) => {
    if (sort === "members") {
      return b.memberCount - a.memberCount || compareStrings(a.name, b.name);
    }
    if (sort === "newest") {
      return compareDates(b.createdAt, a.createdAt) || compareStrings(a.name, b.name);
    }
    return compareDates(b.lastActivityAt, a.lastActivityAt) || compareDates(b.createdAt, a.createdAt) || compareStrings(a.name, b.name);
  });
  return sorted;
}

function newestActivityAt(values: Array<Date | null | undefined>): string | null {
  const timestamps = values
    .filter((value): value is Date => Boolean(value))
    .map((value) => value.getTime())
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function compareDates(left: string | null, right: string | null): number {
  const leftTime = left ? new Date(left).getTime() : 0;
  const rightTime = right ? new Date(right).getTime() : 0;
  return rightTime - leftTime;
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function readParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function normalizeSort(value: string): "active" | "newest" | "members" {
  if (value === "newest") return "newest";
  if (value === "members") return "members";
  return "active";
}

function normalizeView(value: string): "joined" | "my" {
  return value === "my" ? "my" : "joined";
}
