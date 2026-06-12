import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminUser } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { GroupDetailClient } from "@/components/groups/group-detail-client";
import { canModerateGroup } from "@/lib/auth/scoped-moderation";
import { canAssignGroupModerators, getMaxCreatedGroupMembers, resolveUserAccessPolicy } from "@/lib/policy/tier-policy";

type SearchParams = {
  tab?: string | string[];
};

export default async function GroupPage({ params, searchParams }: { params: { groupId: string }; searchParams?: SearchParams }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const initialTab = normalizeTab(readParam(searchParams?.tab));

  const baseInclude = {
    owner: { select: { username: true } },
    members: { include: { user: { select: { id: true, username: true } } } },
  } as const;

  const group =
    initialTab === "groups"
      ? await prisma.group.findUnique({
          where: { id: params.groupId },
          include: {
            ...baseInclude,
            threads: {
              include: {
                author: { select: { username: true } },
                posts: { include: { author: { select: { username: true } } }, orderBy: { createdAt: "asc" } },
              },
              orderBy: { updatedAt: "desc" },
            },
          },
        })
      : initialTab === "documents"
        ? await prisma.group.findUnique({
            where: { id: params.groupId },
            include: {
              ...baseInclude,
              documents: { include: { uploader: { select: { username: true } } }, orderBy: { createdAt: "desc" } },
            },
          })
        : initialTab === "photos"
          ? await prisma.group.findUnique({
              where: { id: params.groupId },
              include: {
                ...baseInclude,
                photos: { include: { uploader: { select: { username: true } } }, orderBy: { createdAt: "desc" } },
                photoAlbums: { orderBy: { createdAt: "asc" } },
              },
            })
          : initialTab === "members"
            ? await prisma.group.findUnique({
                where: { id: params.groupId },
                include: {
                  ...baseInclude,
                  joinRequests: {
                    where: { status: "PENDING" },
                    include: { user: { select: { id: true, username: true } } },
                    orderBy: { createdAt: "asc" },
                  },
                },
              })
            : await prisma.group.findUnique({
                where: { id: params.groupId },
                include: baseInclude,
              });

  if (!group) notFound();
  const groupData = group as typeof group & {
    joinRequests?: Array<{ id: string; user: { id: string; username: string } }>;
    threads?: Array<{
      id: string;
      title: string;
      author: { username: string };
      allowReplyImages: boolean;
      posts: Array<{
        id: string;
        content: string;
        parentCommentId: string | null;
        mediaUrlsJson: string | null;
        createdAt: Date;
        author: { username: string };
      }>;
    }>;
    documents?: Array<{ id: string; title: string; url: string; uploader: { username: string } }>;
    photos?: Array<{ id: string; caption: string | null; url: string; albumId: string | null; tags: string | null; uploader: { username: string } }>;
    photoAlbums?: Array<{ id: string; title: string; description: string | null }>;
  };

  const isAdmin = await isAdminUser(session.user.id);
  const myMember = groupData.members.find((m) => m.userId === session.user.id);
  const canModerate = await canModerateGroup(session.user.id, groupData.id);
  const currentUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true, subscriptionTier: true } });
  const policy = resolveUserAccessPolicy(currentUser);

  return (
    <AppShell>
      <GroupDetailClient
        group={{
          id: groupData.id,
          name: groupData.name,
          description: groupData.description,
          visibility: groupData.visibility,
          ownerId: groupData.ownerId,
          ownerUsername: groupData.owner.username,
          members: groupData.members.map((m) => ({ id: m.user.id, username: m.user.username, role: m.role })),
          joinRequests: (groupData.joinRequests ?? []).map((request) => ({
            id: request.id,
            userId: request.user.id,
            username: request.user.username,
          })),
          events: [],
          threads: (groupData.threads ?? []).map((t) => ({
            id: t.id,
            title: t.title,
            authorUsername: t.author.username,
            allowReplyImages: t.allowReplyImages,
            posts: t.posts.map((p) => ({
              id: p.id,
              content: p.content,
              parentCommentId: p.parentCommentId,
              mediaUrlsJson: p.mediaUrlsJson,
              createdAt: p.createdAt.toISOString(),
              authorUsername: p.author.username,
            })),
          })),
          documents: (groupData.documents ?? []).map((d) => ({ id: d.id, title: d.title, url: d.url, uploaderUsername: d.uploader.username })),
          photos: (groupData.photos ?? []).map((p) => ({
            id: p.id,
            caption: p.caption,
            url: p.url,
            uploaderUsername: p.uploader.username,
            albumId: p.albumId,
            tags: p.tags,
          })),
          photoAlbums: (groupData.photoAlbums ?? []).map((a) => ({ id: a.id, title: a.title, description: a.description })),
        }}
        currentUserId={session.user.id}
        currentRole={myMember?.role || (isAdmin ? "ADMIN" : null)}
        canModerate={Boolean(canModerate)}
        canAssignModerators={canAssignGroupModerators(policy)}
        creatorMemberCap={groupData.ownerId === session.user.id ? getMaxCreatedGroupMembers(policy) : null}
        initialTab={initialTab}
      />
    </AppShell>
  );
}

function readParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function normalizeTab(value: string): "overview" | "groups" | "documents" | "photos" | "members" {
  if (value === "overview") return "overview";
  if (value === "documents") return "documents";
  if (value === "photos") return "photos";
  if (value === "members") return "members";
  return "groups";
}
