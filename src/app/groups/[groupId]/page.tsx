import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminUser } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { GroupDetailClient } from "@/components/groups/group-detail-client";
import { canModerateGroup } from "@/lib/auth/scoped-moderation";
import { canAssignGroupModerators, getMaxCreatedGroupMembers, resolveUserAccessPolicy } from "@/lib/policy/tier-policy";
import { canManageGroupAssets, getGroupAssetUsageBytes, GROUP_ASSET_LIMIT_BYTES } from "@/modules/groups/group-assets.service";

export default async function GroupPage({ params }: { params: { groupId: string } }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const group = await prisma.group.findUnique({
    where: { id: params.groupId },
    include: {
      members: { include: { user: { select: { id: true, username: true } } } },
      joinRequests: {
        where: { status: "PENDING" },
        include: { user: { select: { id: true, username: true } } },
        orderBy: { createdAt: "asc" },
      },
      events: { include: { creator: { select: { username: true } } }, orderBy: { startsAt: "asc" } },
      threads: {
        include: {
          author: { select: { username: true } },
          posts: { include: { author: { select: { username: true } } }, orderBy: { createdAt: "asc" } },
          userPreferences: {
            where: { userId: session.user.id },
            select: { isPinned: true, sortOrder: true },
            take: 1,
          },
        },
        orderBy: { updatedAt: "desc" },
      },
      documents: { include: { uploader: { select: { username: true } } }, orderBy: { createdAt: "desc" } },
      photos: {
        include: {
          uploader: { select: { username: true } },
          comments: {
            include: { author: { select: { username: true, fullName: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      photoAlbums: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!group) notFound();

  const isAdmin = await isAdminUser(session.user.id);
  const myMember = group.members.find((m) => m.userId === session.user.id);
  const canModerate = await canModerateGroup(session.user.id, group.id);
  const currentUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true, subscriptionTier: true } });
  const policy = resolveUserAccessPolicy(currentUser);
  const [assetPermission, groupAssetUsageBytes] = await Promise.all([
    canManageGroupAssets(session.user.id, group.id),
    getGroupAssetUsageBytes(group.id),
  ]);
  const visibleThreads = group.threads.filter((thread) => canModerate || thread.status !== "ENDED");
  const orderedThreads = visibleThreads
    .map((thread, index) => ({
      ...thread,
      preference: thread.userPreferences[0] ?? null,
      fallbackOrder: index,
    }))
    .sort((a, b) => {
      const aPinned = a.preference?.isPinned ?? false;
      const bPinned = b.preference?.isPinned ?? false;
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      const aOrder = a.preference?.sortOrder ?? a.fallbackOrder;
      const bOrder = b.preference?.sortOrder ?? b.fallbackOrder;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });

  return (
    <AppShell>
      <GroupDetailClient
        group={{
          id: group.id,
          name: group.name,
          description: group.description,
          visibility: group.visibility,
          ownerId: group.ownerId,
          members: group.members.map((m) => ({ id: m.user.id, username: m.user.username, role: m.role, isProvider: m.isProvider })),
          joinRequests: group.joinRequests.map((request) => ({
            id: request.id,
            userId: request.user.id,
            username: request.user.username,
          })),
          events: group.events.map((e) => ({
            id: e.id,
            title: e.title,
            description: e.description,
            startsAt: e.startsAt.toISOString(),
            endsAt: e.endsAt ? e.endsAt.toISOString() : null,
            locationName: e.locationName,
            googleMapsUrl: e.googleMapsUrl,
            creatorUsername: e.creator.username,
          })),
          threads: orderedThreads.map((t) => ({
            id: t.id,
            authorId: t.authorId,
            title: t.title,
            authorUsername: t.author.username,
            allowReplyImages: t.allowReplyImages,
            isPinned: t.preference?.isPinned ?? false,
            status: t.status,
            posts: t.posts.map((p) => ({
              id: p.id,
              content: p.content,
              parentCommentId: p.parentCommentId,
              mediaUrlsJson: p.mediaUrlsJson,
              createdAt: p.createdAt.toISOString(),
              authorUsername: p.author.username,
            })),
          })),
          documents: group.documents.map((d) => ({ id: d.id, title: d.title, url: d.url, uploaderUsername: d.uploader.username })),
          photos: group.photos.map((p) => ({
            id: p.id,
            caption: p.caption,
            url: p.url,
            sizeBytes: p.sizeBytes,
            uploaderUsername: p.uploader.username,
            albumId: p.albumId,
            tags: p.tags,
            comments: p.comments.map((comment) => ({
              id: comment.id,
              parentCommentId: comment.parentCommentId,
              content: comment.content,
              mediaUrlsJson: comment.mediaUrlsJson,
              createdAt: comment.createdAt.toISOString(),
              authorUsername: comment.author.username,
              authorFullName: comment.author.fullName,
            })),
          })),
          photoAlbums: group.photoAlbums.map((a) => ({ id: a.id, title: a.title, description: a.description })),
        }}
        currentUserId={session.user.id}
        currentRole={myMember?.role || (isAdmin ? "ADMIN" : null)}
        canModerate={Boolean(canModerate)}
        canAssignModerators={canAssignGroupModerators(policy)}
        creatorMemberCap={group.ownerId === session.user.id ? getMaxCreatedGroupMembers(policy) : null}
        canUploadAssets={assetPermission.ok}
        groupAssetUsageBytes={groupAssetUsageBytes}
        groupAssetLimitBytes={GROUP_ASSET_LIMIT_BYTES}
      />
    </AppShell>
  );
}
