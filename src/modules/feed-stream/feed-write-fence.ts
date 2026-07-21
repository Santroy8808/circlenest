import { Prisma } from "@prisma/client";
import { assertAccountDeletionFenceOpen } from "@/lib/platform/account-deletion-fence";
import { lockReadyMediaAssetsForReference } from "@/lib/platform/media-asset-reference-fence";

type LockedFeedPost = {
  id: string;
  authorUserId: string;
  targetProfileUserId: string | null;
  mediaOwnerUserId: string | null;
};

export async function assertNewFeedPostWriteAllowed(
  tx: Prisma.TransactionClient,
  input: {
    actorUserId: string;
    mediaAssetIds?: readonly string[];
    additionalUserIds?: readonly string[];
  }
) {
  const baseUserIds = [input.actorUserId, ...(input.additionalUserIds ?? [])];
  const mediaAssets = await lockReadyMediaAssetsForReference(
    tx,
    input.mediaAssetIds ?? [],
    { additionalUserIds: baseUserIds }
  );
  await assertAccountDeletionFenceOpen(
    tx,
    [
      ...baseUserIds,
      ...mediaAssets.map((mediaAsset) => mediaAsset.ownerUserId)
    ],
    "Feed content cannot be created after its actor or owner is deactivated or queued for deletion."
  );
}

export async function lockFeedPostForWrite(
  tx: Prisma.TransactionClient,
  postId: string
) {
  const rows = await tx.$queryRaw<LockedFeedPost[]>(Prisma.sql`
    SELECT
      post."id",
      post."authorUserId",
      post."targetProfileUserId",
      media."ownerUserId" AS "mediaOwnerUserId"
    FROM "FeedPost" AS post
    LEFT JOIN "MediaAsset" AS media ON media."id" = post."mediaAssetId"
    WHERE post."id" = ${postId}
    FOR UPDATE OF post
  `);
  return rows[0] ?? null;
}

export async function lockFeedPostForCommentWrite(
  tx: Prisma.TransactionClient,
  commentId: string
) {
  const rows = await tx.$queryRaw<LockedFeedPost[]>(Prisma.sql`
    SELECT
      post."id",
      post."authorUserId",
      post."targetProfileUserId",
      media."ownerUserId" AS "mediaOwnerUserId"
    FROM "FeedPost" AS post
    INNER JOIN "FeedComment" AS comment ON comment."postId" = post."id"
    LEFT JOIN "MediaAsset" AS media ON media."id" = post."mediaAssetId"
    WHERE comment."id" = ${commentId}
    FOR UPDATE OF post
  `);
  return rows[0] ?? null;
}

export async function assertFeedChildWriteAllowed(
  tx: Prisma.TransactionClient,
  input: {
    postId: string;
    actorUserId: string;
    commentId?: string | null;
    mediaAssetIds?: readonly string[];
    additionalUserIds?: readonly string[];
  }
) {
  const post = await lockFeedPostForWrite(tx, input.postId);
  if (!post) return null;

  const comment = input.commentId
    ? await tx.feedComment.findFirst({
        where: { id: input.commentId, postId: post.id },
        select: {
          authorUserId: true,
          mediaAsset: { select: { ownerUserId: true } }
        }
      })
    : null;
  if (input.commentId && !comment) return null;

  const baseUserIds = [
    input.actorUserId,
    post.authorUserId,
    post.targetProfileUserId,
    post.mediaOwnerUserId,
    comment?.authorUserId,
    comment?.mediaAsset?.ownerUserId,
    ...(input.additionalUserIds ?? [])
  ].filter((userId): userId is string => Boolean(userId));
  const mediaAssets = await lockReadyMediaAssetsForReference(
    tx,
    input.mediaAssetIds ?? [],
    { additionalUserIds: baseUserIds }
  );

  await assertAccountDeletionFenceOpen(
    tx,
    [
      ...baseUserIds,
      ...mediaAssets.map((mediaAsset) => mediaAsset.ownerUserId)
    ].filter((userId): userId is string => Boolean(userId)),
    "Feed content cannot be changed after its actor or owner is deactivated or queued for deletion."
  );

  return post;
}

export async function assertFeedCommentWriteAllowed(
  tx: Prisma.TransactionClient,
  input: {
    commentId: string;
    actorUserId: string;
    mediaAssetIds?: readonly string[];
    additionalUserIds?: readonly string[];
  }
) {
  const post = await lockFeedPostForCommentWrite(tx, input.commentId);
  if (!post) return null;
  return assertFeedChildWriteAllowed(tx, {
    postId: post.id,
    commentId: input.commentId,
    actorUserId: input.actorUserId,
    mediaAssetIds: input.mediaAssetIds,
    additionalUserIds: input.additionalUserIds
  });
}
