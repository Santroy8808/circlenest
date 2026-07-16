import { ConductLocationType, FeedVisibility, GroupVisibility } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { createConductFingerprint, hashConductEvidence } from "@/modules/conduct-reporting/references";

export const CONDUCT_SCANNER_SOURCE_MODELS = [
  "FeedPost",
  "FeedComment",
  "GroupForumThread",
  "GroupForumPost",
  "GroupAssetComment",
  "ConductDisputeMessage"
] as const;

export const CONDUCT_SCANNER_EXCLUDED_MODELS = [
  "ChatThread",
  "ChatMessage",
  "EncryptedChatThread",
  "EncryptedChatMessage",
  "MailThread",
  "MailMessage"
] as const;

export type ConductContentSource = {
  locationType: ConductLocationType;
  contentId: string;
  authorUserId: string;
  groupId: string | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  permalink: string;
  contextRootId: string;
  evidenceSnapshot: {
    locationType: ConductLocationType;
    contentId: string;
    authorUserId: string;
    groupId: string | null;
    body: string;
    createdAt: string;
    updatedAt: string;
    permalink: string;
  };
  evidenceHash: string;
  fingerprint: string;
};

function cleanId(value: unknown) {
  if (typeof value !== "string") return "";
  const clean = value.trim();
  return clean.length > 0 && clean.length <= 100 ? clean : "";
}

async function canViewGroupContent(viewerUserId: string, group: { id: string; visibility: GroupVisibility; archivedAt: Date | null }) {
  if (group.archivedAt) return false;
  if (group.visibility === GroupVisibility.PUBLIC) return true;
  return Boolean(
    await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: viewerUserId } },
      select: { id: true }
    })
  );
}

function finishSource(input: Omit<ConductContentSource, "evidenceSnapshot" | "evidenceHash" | "fingerprint">): ConductContentSource {
  const evidenceSnapshot = {
    locationType: input.locationType,
    contentId: input.contentId,
    authorUserId: input.authorUserId,
    groupId: input.groupId,
    body: input.body,
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
    permalink: input.permalink
  };
  return {
    ...input,
    evidenceSnapshot,
    evidenceHash: hashConductEvidence(evidenceSnapshot),
    fingerprint: createConductFingerprint([input.locationType, input.contentId])
  };
}

export async function resolveConductContentForViewer(
  viewerUserId: string,
  locationType: ConductLocationType,
  rawContentId: string
): Promise<ConductContentSource | null> {
  const contentId = cleanId(rawContentId);
  if (!contentId || !cleanId(viewerUserId)) return null;

  if (locationType === ConductLocationType.MAIN_STREAM_POST) {
    const post = await prisma.feedPost.findFirst({
      where: {
        id: contentId,
        visibility: FeedVisibility.MEMBERS,
        streamArchivedAt: null,
        streamDeletedAt: null,
        adminHoldAt: null
      },
      select: { id: true, authorUserId: true, body: true, createdAt: true, updatedAt: true }
    });
    return post
      ? finishSource({
          locationType,
          contentId: post.id,
          authorUserId: post.authorUserId,
          groupId: null,
          body: post.body,
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
          permalink: `/posts/${encodeURIComponent(post.id)}`,
          contextRootId: post.id
        })
      : null;
  }

  if (locationType === ConductLocationType.MAIN_STREAM_COMMENT) {
    const comment = await prisma.feedComment.findFirst({
      where: {
        id: contentId,
        deletedAt: null,
        post: {
          visibility: FeedVisibility.MEMBERS,
          streamArchivedAt: null,
          streamDeletedAt: null,
          adminHoldAt: null
        }
      },
      select: { id: true, postId: true, authorUserId: true, body: true, createdAt: true, updatedAt: true }
    });
    return comment
      ? finishSource({
          locationType,
          contentId: comment.id,
          authorUserId: comment.authorUserId,
          groupId: null,
          body: comment.body,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
          permalink: `/posts/${encodeURIComponent(comment.postId)}?commentId=${encodeURIComponent(comment.id)}`,
          contextRootId: comment.postId
        })
      : null;
  }

  if (locationType === ConductLocationType.GROUP_FORUM_THREAD) {
    const thread = await prisma.groupForumThread.findFirst({
      where: { id: contentId, deletedAt: null },
      select: {
        id: true,
        groupId: true,
        authorUserId: true,
        title: true,
        body: true,
        createdAt: true,
        updatedAt: true,
        group: { select: { id: true, slug: true, visibility: true, archivedAt: true } }
      }
    });
    if (!thread || !(await canViewGroupContent(viewerUserId, thread.group))) return null;
    return finishSource({
      locationType,
      contentId: thread.id,
      authorUserId: thread.authorUserId,
      groupId: thread.groupId,
      body: `${thread.title}\n\n${thread.body}`.trim(),
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      permalink: `/groups/${encodeURIComponent(thread.group.slug)}/forum/${encodeURIComponent(thread.id)}`,
      contextRootId: thread.id
    });
  }

  if (locationType === ConductLocationType.GROUP_FORUM_POST) {
    const post = await prisma.groupForumPost.findFirst({
      where: { id: contentId, deletedAt: null, thread: { deletedAt: null } },
      select: {
        id: true,
        threadId: true,
        authorUserId: true,
        body: true,
        createdAt: true,
        updatedAt: true,
        thread: {
          select: {
            groupId: true,
            group: { select: { id: true, slug: true, visibility: true, archivedAt: true } }
          }
        }
      }
    });
    if (!post || !(await canViewGroupContent(viewerUserId, post.thread.group))) return null;
    return finishSource({
      locationType,
      contentId: post.id,
      authorUserId: post.authorUserId,
      groupId: post.thread.groupId,
      body: post.body,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      permalink: `/groups/${encodeURIComponent(post.thread.group.slug)}/forum/${encodeURIComponent(post.threadId)}?postId=${encodeURIComponent(post.id)}`,
      contextRootId: post.threadId
    });
  }

  if (locationType === ConductLocationType.GROUP_ASSET_COMMENT) {
    const comment = await prisma.groupAssetComment.findFirst({
      where: { id: contentId, deletedAt: null, asset: { deletedAt: null } },
      select: {
        id: true,
        authorUserId: true,
        body: true,
        createdAt: true,
        asset: {
          select: {
            id: true,
            groupId: true,
            updatedAt: true,
            group: { select: { id: true, slug: true, visibility: true, archivedAt: true } }
          }
        }
      }
    });
    if (!comment || !(await canViewGroupContent(viewerUserId, comment.asset.group))) return null;
    return finishSource({
      locationType,
      contentId: comment.id,
      authorUserId: comment.authorUserId,
      groupId: comment.asset.groupId,
      body: comment.body,
      createdAt: comment.createdAt,
      updatedAt: comment.asset.updatedAt,
      permalink: `/groups/${encodeURIComponent(comment.asset.group.slug)}/gallery/${encodeURIComponent(comment.asset.id)}?commentId=${encodeURIComponent(comment.id)}`,
      contextRootId: comment.asset.id
    });
  }

  return null;
}

export function assertConductScannerModelBoundary(models: readonly string[]) {
  const excluded = new Set<string>(CONDUCT_SCANNER_EXCLUDED_MODELS);
  const violation = models.find((model) => excluded.has(model));
  if (violation) throw new Error(`Private communication model ${violation} is forbidden in conduct scanning.`);
  const allowed = new Set<string>(CONDUCT_SCANNER_SOURCE_MODELS);
  const unknown = models.find((model) => !allowed.has(model));
  if (unknown) throw new Error(`Conduct scanner source ${unknown} is not allowlisted.`);
  return true;
}
