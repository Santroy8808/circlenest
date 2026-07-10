import {
  FeedVisibility,
  GroupVisibility,
  JobListingStatus,
  MarketListingStatus,
  ManuscriptVisibility,
  ProfileVisibility,
  SocialRelationshipType,
  UserRole
} from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { isAdminRole } from "@/lib/platform/roles";
import type { SearchResultGroup, SearchResultItem, SearchView } from "@/modules/search-discovery/types";

const MODULE_KEY = "search-discovery";
const SEARCH_DB_TIMEOUT_MS = 3200;
const RESULT_TAKE = 8;

function withSearchDbTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${operation} timed out`)), SEARCH_DB_TIMEOUT_MS);
    })
  ]);
}

function emptySearchView(query: string): SearchView {
  return {
    query,
    groups: [],
    total: 0
  };
}

function compact(value?: string | null, length = 150) {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= length) return normalized;
  return `${normalized.slice(0, length - 1)}...`;
}

function displayName(user: { username: string; profile: { displayName: string | null } | null }) {
  return user.profile?.displayName ?? user.username;
}

function mediaAssetUrl(mediaAsset?: { id: string } | null) {
  return mediaAsset ? `/api/media/assets/${mediaAsset.id}` : null;
}

function groupWithItems(kind: SearchResultGroup["kind"], title: string, items: SearchResultItem[]): SearchResultGroup | null {
  return items.length ? { kind, title, items } : null;
}

async function getViewerRole(viewerUserId: string) {
  const viewer = await prisma.user.findUnique({
    where: { id: viewerUserId },
    select: { role: true }
  });

  return viewer?.role ?? UserRole.MEMBER;
}

async function getBlockedUserIds(viewerUserId: string) {
  const relationships = await prisma.socialRelationship.findMany({
    where: {
      type: SocialRelationshipType.BLOCK,
      OR: [{ fromUserId: viewerUserId }, { toUserId: viewerUserId }]
    },
    select: {
      fromUserId: true,
      toUserId: true
    }
  });

  return relationships.map((relationship) =>
    relationship.fromUserId === viewerUserId ? relationship.toUserId : relationship.fromUserId
  );
}

async function getTrustedFeedAuthorIds(viewerUserId: string) {
  const relationships = await prisma.socialRelationship.findMany({
    where: {
      type: { in: [SocialRelationshipType.FRIEND, SocialRelationshipType.FAMILY, SocialRelationshipType.ACQUAINTANCE] },
      OR: [{ fromUserId: viewerUserId }, { toUserId: viewerUserId }]
    },
    select: {
      fromUserId: true,
      toUserId: true
    }
  });

  return relationships.map((relationship) =>
    relationship.fromUserId === viewerUserId ? relationship.toUserId : relationship.fromUserId
  );
}

async function searchPeople(input: { viewerUserId: string; viewerRole: UserRole; blockedUserIds: string[]; query: string }) {
  const people = await prisma.user.findMany({
    where: {
      deactivatedAt: null,
      id: {
        notIn: [input.viewerUserId, ...input.blockedUserIds]
      },
      AND: [
        isAdminRole(input.viewerRole)
          ? {}
          : {
              profile: {
                is: {
                  visibility: {
                    in: [ProfileVisibility.MEMBERS, ProfileVisibility.PUBLIC]
                  }
                }
              }
            },
        {
          OR: [
            { username: { contains: input.query, mode: "insensitive" } },
            {
              profile: {
                is: {
                  OR: [
                    { displayName: { contains: input.query, mode: "insensitive" } },
                    { tagline: { contains: input.query, mode: "insensitive" } },
                    { bio: { contains: input.query, mode: "insensitive" } },
                    { location: { contains: input.query, mode: "insensitive" } }
                  ]
                }
              }
            }
          ]
        }
      ]
    },
    include: {
      profile: true
    },
    orderBy: {
      updatedAt: "desc"
    },
    take: RESULT_TAKE
  });

  return people.map<SearchResultItem>((person) => ({
    id: person.id,
    title: displayName(person),
    subtitle: `Full name: ${displayName(person)} - @${person.username}`,
    description: compact(person.profile?.tagline ?? person.profile?.bio),
    href: `/profile/${person.username}`,
    badge: "Person",
    meta: person.profile?.location,
    imageUrl: person.profile?.avatarUrl
  }));
}

async function searchGroups(input: { viewerUserId: string; viewerRole: UserRole; query: string }) {
  const groups = await prisma.group.findMany({
    where: {
      archivedAt: null,
      AND: [
        {
          OR: [
            { name: { contains: input.query, mode: "insensitive" } },
            { tagline: { contains: input.query, mode: "insensitive" } },
            { description: { contains: input.query, mode: "insensitive" } }
          ]
        },
        isAdminRole(input.viewerRole)
          ? {}
          : {
              OR: [
                { visibility: GroupVisibility.PUBLIC },
                {
                  members: {
                    some: {
                      userId: input.viewerUserId
                    }
                  }
                }
              ]
            }
      ]
    },
    include: {
      _count: {
        select: {
          members: true
        }
      }
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: RESULT_TAKE
  });

  return groups.map<SearchResultItem>((group) => ({
    id: group.id,
    title: group.name,
    subtitle: group.tagline,
    description: compact(group.description),
    href: `/groups/${group.slug}`,
    badge: "Group",
    meta: `${group.visibility.toLowerCase()} - ${group._count.members} members`,
    imageUrl: group.avatarUrl
  }));
}

async function searchMarket(input: { blockedUserIds: string[]; query: string }) {
  const listings = await prisma.marketListing.findMany({
    where: {
      sellerUserId: {
        notIn: input.blockedUserIds
      },
      status: MarketListingStatus.ACTIVE,
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        {
          OR: [
            { title: { contains: input.query, mode: "insensitive" } },
            { description: { contains: input.query, mode: "insensitive" } }
          ]
        }
      ]
    },
    include: {
      photos: {
        include: {
          mediaAsset: true
        },
        orderBy: {
          sortOrder: "asc"
        },
        take: 1
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    take: RESULT_TAKE
  });

  return listings.map<SearchResultItem>((listing) => ({
    id: listing.id,
    title: listing.title,
    subtitle: listing.category.replaceAll("_", " ").toLowerCase(),
    description: compact(listing.description),
    href: `/market/${listing.slug}`,
    badge: "Market",
    meta:
      listing.priceCents === null
        ? "Contact seller"
        : new Intl.NumberFormat("en-US", { style: "currency", currency: listing.currency }).format(listing.priceCents / 100),
    imageUrl: mediaAssetUrl(listing.photos[0]?.mediaAsset)
  }));
}

async function searchJobs(input: { blockedUserIds: string[]; query: string }) {
  const jobs = await prisma.jobListing.findMany({
    where: {
      employerUserId: {
        notIn: input.blockedUserIds
      },
      status: JobListingStatus.ACTIVE,
      OR: [
        { title: { contains: input.query, mode: "insensitive" } },
        { companyName: { contains: input.query, mode: "insensitive" } },
        { summary: { contains: input.query, mode: "insensitive" } },
        { description: { contains: input.query, mode: "insensitive" } },
        { location: { contains: input.query, mode: "insensitive" } }
      ]
    },
    orderBy: {
      createdAt: "desc"
    },
    take: RESULT_TAKE
  });

  return jobs.map<SearchResultItem>((job) => ({
    id: job.id,
    title: job.title,
    subtitle: job.companyName,
    description: compact(job.summary ?? job.description),
    href: `/jobs/${job.slug}`,
    badge: "Job",
    meta: [job.remote ? "Remote" : null, job.location, job.compensation].filter(Boolean).join(" - ")
  }));
}

async function searchAuditors(input: { blockedUserIds: string[]; query: string }) {
  const auditors = await prisma.auditorProfile.findMany({
    where: {
      active: true,
      userId: {
        notIn: input.blockedUserIds
      },
      OR: [
        { practiceName: { contains: input.query, mode: "insensitive" } },
        { location: { contains: input.query, mode: "insensitive" } },
        { bio: { contains: input.query, mode: "insensitive" } },
        { offerings: { contains: input.query, mode: "insensitive" } }
      ]
    },
    include: {
      user: {
        include: {
          profile: true
        }
      }
    },
    orderBy: {
      updatedAt: "desc"
    },
    take: RESULT_TAKE
  });

  return auditors.map<SearchResultItem>((auditor) => ({
    id: auditor.id,
    title: auditor.practiceName,
    subtitle: displayName(auditor.user),
    description: compact(auditor.offerings ?? auditor.bio),
    href: `/auditors/${auditor.user.username}`,
    badge: "Auditor",
    meta: auditor.willingToTravel ? `${auditor.location ?? "Location flexible"} - travels` : auditor.location,
    imageUrl: auditor.user.profile?.avatarUrl
  }));
}

async function searchWriters(input: { viewerUserId: string; viewerRole: UserRole; blockedUserIds: string[]; query: string }) {
  const manuscripts = await prisma.writerManuscript.findMany({
    where: {
      authorUserId: {
        notIn: input.blockedUserIds
      },
      AND: [
        {
          OR: [
            { title: { contains: input.query, mode: "insensitive" } },
            { genre: { contains: input.query, mode: "insensitive" } },
            { summary: { contains: input.query, mode: "insensitive" } }
          ]
        },
        isAdminRole(input.viewerRole)
          ? {}
          : {
              OR: [{ visibility: ManuscriptVisibility.MEMBERS }, { authorUserId: input.viewerUserId }]
            }
      ]
    },
    include: {
      author: {
        include: {
          profile: true
        }
      },
      _count: {
        select: {
          chapters: true
        }
      }
    },
    orderBy: {
      updatedAt: "desc"
    },
    take: RESULT_TAKE
  });

  return manuscripts.map<SearchResultItem>((manuscript) => ({
    id: manuscript.id,
    title: manuscript.title,
    subtitle: manuscript.genre,
    description: compact(manuscript.summary),
    href: `/writers-corner/${manuscript.slug}`,
    badge: "Writer",
    meta: `${displayName(manuscript.author)} - ${manuscript._count.chapters} chapters`,
    imageUrl: manuscript.author.profile?.avatarUrl
  }));
}

async function searchPosts(input: {
  viewerUserId: string;
  viewerRole: UserRole;
  blockedUserIds: string[];
  trustedFeedAuthorIds: string[];
  query: string;
}) {
  const posts = await prisma.feedPost.findMany({
    where: {
      authorUserId: {
        notIn: input.blockedUserIds
      },
      body: {
        contains: input.query,
        mode: "insensitive"
      },
      AND: [
        isAdminRole(input.viewerRole)
          ? {}
          : {
              OR: [
                { authorUserId: input.viewerUserId },
                { visibility: FeedVisibility.MEMBERS },
                {
                  visibility: FeedVisibility.FRIENDS,
                  authorUserId: {
                    in: input.trustedFeedAuthorIds
                  }
                }
              ]
            }
      ]
    },
    include: {
      author: {
        include: {
          profile: true
        }
      },
      mediaAsset: true,
      _count: {
        select: {
          comments: true,
          reactions: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    take: RESULT_TAKE
  });

  return posts.map<SearchResultItem>((post) => ({
    id: post.id,
    title: compact(post.body, 80) ?? "Post",
    subtitle: displayName(post.author),
    description: compact(post.body, 160),
    href: `/home?post=${post.id}`,
    badge: "Post",
    meta: `${post._count.comments} comments - ${post._count.reactions} reactions`,
    imageUrl: mediaAssetUrl(post.mediaAsset)
  }));
}

export async function searchPlatform(viewerUserId: string, rawQuery?: string | null): Promise<SearchView> {
  const query = rawQuery?.trim() ?? "";

  if (query.length < 2) {
    return emptySearchView(query);
  }

  const [viewerRole, blockedUserIds, trustedFeedAuthorIds] = await Promise.all([
    getViewerRole(viewerUserId),
    getBlockedUserIds(viewerUserId),
    getTrustedFeedAuthorIds(viewerUserId)
  ]);

  const [people, groups, market, jobs, auditors, writers, posts] = await withSearchDbTimeout(
    Promise.all([
      searchPeople({ viewerUserId, viewerRole, blockedUserIds, query }),
      searchGroups({ viewerUserId, viewerRole, query }),
      searchMarket({ blockedUserIds, query }),
      searchJobs({ blockedUserIds, query }),
      searchAuditors({ blockedUserIds, query }),
      searchWriters({ viewerUserId, viewerRole, blockedUserIds, query }),
      searchPosts({ viewerUserId, viewerRole, blockedUserIds, trustedFeedAuthorIds, query })
    ]),
    "platform search"
  );

  const resultGroups = [
    groupWithItems("people", "People", people),
    groupWithItems("groups", "Groups", groups),
    groupWithItems("market", "The Market", market),
    groupWithItems("jobs", "Jobs", jobs),
    groupWithItems("auditors", "Auditors", auditors),
    groupWithItems("writers", "Writers Corner", writers),
    groupWithItems("posts", "Posts", posts)
  ].filter((group): group is SearchResultGroup => Boolean(group));

  return {
    query,
    groups: resultGroups,
    total: resultGroups.reduce((sum, group) => sum + group.items.length, 0)
  };
}

export async function safeSearchPlatform(viewerUserId: string, query?: string | null): Promise<SearchView> {
  try {
    return await searchPlatform(viewerUserId, query);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not complete search.", {
      viewerUserId,
      query,
      error: error instanceof Error ? error.message : "unknown"
    });
    return emptySearchView(query?.trim() ?? "");
  }
}
