import { FeedReactionType, HashtagSignalKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/db";

const HASHTAG_PATTERN = /(?:^|[\s([{])#([a-zA-Z0-9][a-zA-Z0-9_-]{1,63})\b/g;
const REACTION_SIGNALS = [
  HashtagSignalKind.REACTION_LIKE,
  HashtagSignalKind.REACTION_LOVE,
  HashtagSignalKind.REACTION_CARE,
  HashtagSignalKind.REACTION_HAHA,
  HashtagSignalKind.REACTION_WOW,
  HashtagSignalKind.REACTION_SAD,
  HashtagSignalKind.REACTION_ANGRY,
  HashtagSignalKind.REACTION_DISLIKE
];

type DbClient = typeof prisma | Prisma.TransactionClient;

type ParsedHashtag = {
  displayName: string;
  normalized: string;
};

function signalForReaction(type: FeedReactionType) {
  const map: Record<FeedReactionType, { signal: HashtagSignalKind; weight: number; isNegative: boolean }> = {
    [FeedReactionType.LIKE]: { signal: HashtagSignalKind.REACTION_LIKE, weight: 1, isNegative: false },
    [FeedReactionType.LOVE]: { signal: HashtagSignalKind.REACTION_LOVE, weight: 3, isNegative: false },
    [FeedReactionType.CARE]: { signal: HashtagSignalKind.REACTION_CARE, weight: 2, isNegative: false },
    [FeedReactionType.HAHA]: { signal: HashtagSignalKind.REACTION_HAHA, weight: 1, isNegative: false },
    [FeedReactionType.WOW]: { signal: HashtagSignalKind.REACTION_WOW, weight: 1, isNegative: false },
    [FeedReactionType.SAD]: { signal: HashtagSignalKind.REACTION_SAD, weight: 1, isNegative: false },
    [FeedReactionType.ANGRY]: { signal: HashtagSignalKind.REACTION_ANGRY, weight: 1, isNegative: false },
    [FeedReactionType.DISLIKE]: { signal: HashtagSignalKind.REACTION_DISLIKE, weight: -3, isNegative: true }
  };

  return map[type];
}

export function parseHashtags(text: string): ParsedHashtag[] {
  const tags = new Map<string, ParsedHashtag>();

  for (const match of text.matchAll(HASHTAG_PATTERN)) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    const normalized = raw.toLowerCase();
    if (!tags.has(normalized)) {
      tags.set(normalized, { displayName: raw, normalized });
    }
  }

  return [...tags.values()];
}

async function ensureHashtags(tx: DbClient, actorUserId: string, tags: ParsedHashtag[]) {
  return Promise.all(
    tags.map((tag) =>
      tx.hashtag.upsert({
        where: { normalized: tag.normalized },
        update: {},
        create: {
          normalized: tag.normalized,
          displayName: tag.displayName,
          createdByUserId: actorUserId
        },
        select: { id: true, normalized: true }
      })
    )
  );
}

async function createTagCreationSignals(tx: DbClient, actorUserId: string, hashtagIds: string[], sourceType: string, sourceId: string) {
  if (hashtagIds.length === 0) return;

  await tx.userHashtagSignal.createMany({
    data: hashtagIds.map((hashtagId) => ({
      userId: actorUserId,
      hashtagId,
      sourceType,
      sourceId,
      signal: HashtagSignalKind.CREATED_TAG,
      weight: 2,
      isNegative: false
    })),
    skipDuplicates: true
  });
}

export async function attachFeedPostHashtags(tx: DbClient, input: { actorUserId: string; body: string; mediaAssetId?: string | null; postId: string }) {
  const tags = parseHashtags(input.body);
  if (tags.length === 0) return;

  const hashtags = await ensureHashtags(tx, input.actorUserId, tags);
  const hashtagIds = hashtags.map((tag) => tag.id);

  await tx.feedPostHashtag.createMany({
    data: hashtagIds.map((hashtagId) => ({
      postId: input.postId,
      hashtagId,
      taggedByUserId: input.actorUserId
    })),
    skipDuplicates: true
  });

  if (input.mediaAssetId) {
    await tx.mediaAssetHashtag.createMany({
      data: hashtagIds.map((hashtagId) => ({
        mediaAssetId: input.mediaAssetId!,
        hashtagId,
        taggedByUserId: input.actorUserId,
        sourceType: "FEED_POST",
        sourceId: input.postId
      })),
      skipDuplicates: true
    });
  }

  await createTagCreationSignals(tx, input.actorUserId, hashtagIds, "FEED_POST", input.postId);
}

export async function attachFeedCommentHashtags(
  tx: DbClient,
  input: { actorUserId: string; body: string; commentId: string; mediaAssetId?: string | null }
) {
  const tags = parseHashtags(input.body);
  if (tags.length === 0) return;

  const hashtags = await ensureHashtags(tx, input.actorUserId, tags);
  const hashtagIds = hashtags.map((tag) => tag.id);

  await tx.feedCommentHashtag.createMany({
    data: hashtagIds.map((hashtagId) => ({
      commentId: input.commentId,
      hashtagId,
      taggedByUserId: input.actorUserId
    })),
    skipDuplicates: true
  });

  if (input.mediaAssetId) {
    await tx.mediaAssetHashtag.createMany({
      data: hashtagIds.map((hashtagId) => ({
        mediaAssetId: input.mediaAssetId!,
        hashtagId,
        taggedByUserId: input.actorUserId,
        sourceType: "FEED_COMMENT",
        sourceId: input.commentId
      })),
      skipDuplicates: true
    });
  }

  await createTagCreationSignals(tx, input.actorUserId, hashtagIds, "FEED_COMMENT", input.commentId);
}

export async function recordPostCommentSignal(userId: string, postId: string) {
  const tags = await prisma.feedPostHashtag.findMany({
    where: { postId },
    select: { hashtagId: true }
  });

  if (tags.length === 0) return;

  await prisma.userHashtagSignal.createMany({
    data: tags.map((tag) => ({
      userId,
      hashtagId: tag.hashtagId,
      sourceType: "FEED_POST",
      sourceId: postId,
      signal: HashtagSignalKind.COMMENT,
      weight: 2,
      isNegative: false
    })),
    skipDuplicates: true
  });
}

export async function recordPostShareSignal(userId: string, postId: string) {
  const tags = await prisma.feedPostHashtag.findMany({
    where: { postId },
    select: { hashtagId: true }
  });

  if (tags.length === 0) return;

  await prisma.userHashtagSignal.createMany({
    data: tags.map((tag) => ({
      userId,
      hashtagId: tag.hashtagId,
      sourceType: "FEED_POST",
      sourceId: postId,
      signal: HashtagSignalKind.SHARE,
      weight: 3,
      isNegative: false
    })),
    skipDuplicates: true
  });
}

export async function recordPostReactionSignals(userId: string, postId: string, type: FeedReactionType) {
  const tags = await prisma.feedPostHashtag.findMany({
    where: { postId },
    select: { hashtagId: true }
  });

  await recordReactionSignals(userId, "FEED_POST", postId, tags.map((tag) => tag.hashtagId), type);
}

export async function recordCommentReactionSignals(userId: string, commentId: string, type: FeedReactionType) {
  const tags = await prisma.feedCommentHashtag.findMany({
    where: { commentId },
    select: { hashtagId: true }
  });

  await recordReactionSignals(userId, "FEED_COMMENT", commentId, tags.map((tag) => tag.hashtagId), type);
}

async function recordReactionSignals(userId: string, sourceType: string, sourceId: string, hashtagIds: string[], type: FeedReactionType) {
  await prisma.userHashtagSignal.deleteMany({
    where: {
      userId,
      sourceType,
      sourceId,
      signal: { in: REACTION_SIGNALS }
    }
  });

  if (hashtagIds.length === 0) return;

  const signal = signalForReaction(type);
  await prisma.userHashtagSignal.createMany({
    data: hashtagIds.map((hashtagId) => ({
      userId,
      hashtagId,
      sourceType,
      sourceId,
      signal: signal.signal,
      weight: signal.weight,
      isNegative: signal.isNegative
    })),
    skipDuplicates: true
  });
}
