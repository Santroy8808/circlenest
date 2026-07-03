WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "postId", "userId"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "FeedPostReaction"
)
DELETE FROM "FeedPostReaction"
WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 1);

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "commentId", "userId"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "FeedCommentReaction"
)
DELETE FROM "FeedCommentReaction"
WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 1);

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "threadId", "userId"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "GroupForumThreadReaction"
)
DELETE FROM "GroupForumThreadReaction"
WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 1);

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "postId", "userId"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "GroupForumPostReaction"
)
DELETE FROM "GroupForumPostReaction"
WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS "FeedPostReaction_postId_userId_key"
  ON "FeedPostReaction"("postId", "userId");

CREATE UNIQUE INDEX IF NOT EXISTS "FeedCommentReaction_commentId_userId_key"
  ON "FeedCommentReaction"("commentId", "userId");

CREATE UNIQUE INDEX IF NOT EXISTS "GroupForumThreadReaction_threadId_userId_key"
  ON "GroupForumThreadReaction"("threadId", "userId");

CREATE UNIQUE INDEX IF NOT EXISTS "GroupForumPostReaction_postId_userId_key"
  ON "GroupForumPostReaction"("postId", "userId");
