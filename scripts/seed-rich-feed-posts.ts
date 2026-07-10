import "./load-next-env";
import {
  FeedReactionType,
  FeedVisibility,
  MediaVisibility,
  MembershipTier,
  PrismaClient
} from "@prisma/client";
import { assertLocalQaDatabase } from "./local-qa-database";

const prisma = new PrismaClient();

const DEMO_DOMAIN = "demo.theta-space.dev";
const POST_COUNT = 100;
const MARKER_PREFIX = "#seed-rich-feed-";
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();

type SeedAccount = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  tier: MembershipTier;
};

const themes = [
  {
    title: "Course room momentum",
    topic: "course progress",
    detail: "I spent the morning tightening up my study routine, then used the afternoon to apply it directly at work.",
    takeaway: "The biggest win was noticing how much easier communication gets when I write down the exact question first.",
    prompt: "How are others keeping course notes organized without turning them into another project?"
  },
  {
    title: "Local meetup planning",
    topic: "local coordination",
    detail: "A few of us are planning a small after-service meetup and trying to keep the logistics simple.",
    takeaway: "The useful part has been keeping one thread for times, one thread for rides, and one place for photos afterward.",
    prompt: "If your area has a clean meetup checklist, I would like to compare notes."
  },
  {
    title: "Market listing cleanup",
    topic: "member market",
    detail: "I went through several old materials and sorted what should be kept, donated, or listed for another member.",
    takeaway: "Photos with a short condition note made the listing much easier for people to evaluate quickly.",
    prompt: "Do you prefer seeing exact pickup windows in the listing, or should that stay in messages?"
  },
  {
    title: "Family weekend win",
    topic: "family updates",
    detail: "We had a quiet weekend that still turned into a good practical win for the family schedule.",
    takeaway: "The simple change was deciding the next action before ending the conversation, not later when everyone is busy.",
    prompt: "I am curious how other families are using groups versus direct messages for planning."
  },
  {
    title: "Business profile test drive",
    topic: "business profiles",
    detail: "I switched into the business profile today and tested posting from that identity instead of my personal account.",
    takeaway: "It feels right when the post is clearly from the business, but replies still land in a normal conversation flow.",
    prompt: "What would make a business update feel useful rather than promotional noise?"
  },
  {
    title: "Photo walk notes",
    topic: "gallery sharing",
    detail: "Shared a few shots from a walk and used tags so they do not get mixed into the wrong gallery view.",
    takeaway: "The best thumbnails are the ones that tell the story before anyone opens the full image.",
    prompt: "I would like feedback on whether gallery tags should be broad or very specific."
  },
  {
    title: "Writers corner progress",
    topic: "writing",
    detail: "Worked through a chapter outline and tried to turn the notes into a clean release plan.",
    takeaway: "Publishing smaller chapter updates seems easier than waiting until the whole manuscript feels perfect.",
    prompt: "For subscribers, would you rather get chapter alerts weekly or only when a larger section is ready?"
  },
  {
    title: "Messages and follow-up",
    topic: "communication",
    detail: "Cleaned up a few message threads and moved longer planning into groups where everyone can find the history.",
    takeaway: "Direct messages are best for quick decisions, but recurring work needs a shared place.",
    prompt: "Where do you draw the line between chat, mail, and a group thread?"
  },
  {
    title: "Event prep checklist",
    topic: "events",
    detail: "Pulled together a small event prep list with arrivals, supplies, confirmations, and photo notes.",
    takeaway: "The event page is most useful when it answers who, when, where, and what to bring without extra searching.",
    prompt: "What is the one event detail you always wish people posted sooner?"
  },
  {
    title: "Auditor profile review",
    topic: "auditor profiles",
    detail: "Reviewed an auditor profile and looked at how listings should read from a member perspective.",
    takeaway: "A clear practice description and location matter more than a long list of credentials.",
    prompt: "What information would help you decide whether to send an inquiry?"
  }
];

const comments = [
  "This is the kind of post that makes the stream feel alive. The details help.",
  "I like the practical breakdown. It gives me something specific to test.",
  "Good point on keeping the next action clear. That would help our group too.",
  "The photo makes the post much easier to understand at a glance.",
  "I would keep this visible in the main stream so newer members can find it.",
  "This is useful. A short checklist version would be worth saving."
];

function daysAgo(days: number, minutes = 0) {
  return new Date(NOW.getTime() - days * DAY + minutes * 60 * 1000);
}

function pick<T>(items: T[], index: number) {
  return items[index % items.length];
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function imageUrl(seed: string, width = 1100, height = 720) {
  return `https://picsum.photos/seed/${encodeURIComponent(slugify(seed))}/${width}/${height}`;
}

function feedMarker(index: number) {
  return `${MARKER_PREFIX}${String(index + 1).padStart(3, "0")}`;
}

function postBody(index: number, author: SeedAccount) {
  const theme = pick(themes, index);
  const numbered = index % 4 === 0;
  const localNote = author.tier === MembershipTier.PROFESSIONAL
    ? "I am looking at this from the business-account side too, because the workflow should still feel like a normal account."
    : author.tier === MembershipTier.AUDITOR
      ? "The auditor profile angle matters here too, because members need enough context to know when to reach out."
      : "This is from the regular member side, so I am paying attention to what feels natural in daily use.";

  const list = numbered
    ? `1. Start with the exact purpose.\n2. Add the useful details.\n3. Leave a clear next step.`
    : `- What worked: ${theme.takeaway}\n- What I am testing next: ${theme.prompt}`;

  return [
    `**${theme.title}**`,
    `${theme.detail} ${localNote}`,
    theme.takeaway,
    list,
    `${theme.prompt} ${feedMarker(index)}`
  ].join("\n");
}

function reactionUsers(accounts: SeedAccount[], start: number, count: number, excludeUserId: string) {
  const selected: SeedAccount[] = [];
  for (let offset = 0; selected.length < count && offset < accounts.length * 2; offset += 1) {
    const candidate = accounts[(start + offset * 5) % accounts.length];
    if (candidate.id !== excludeUserId && !selected.some((user) => user.id === candidate.id)) {
      selected.push(candidate);
    }
  }
  return selected;
}

async function getSeedAccounts() {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { endsWith: `@${DEMO_DOMAIN}` } },
        { username: { in: ["admin", "midearmon", "mike", "sally", "jules"] } }
      ]
    },
    orderBy: [{ email: "asc" }],
    select: {
      id: true,
      email: true,
      username: true,
      membership: { select: { tier: true } },
      profile: { select: { displayName: true } }
    }
  });

  const accounts = users
    .filter((user) => user.membership)
    .map((user) => ({
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.profile?.displayName ?? user.username,
      tier: user.membership?.tier ?? MembershipTier.FREE
    }));

  if (accounts.length < 8) {
    throw new Error(`Need at least 8 seed accounts to create varied feed posts. Found ${accounts.length}. Run npm run db:seed:demo-network first.`);
  }

  return accounts;
}

async function createPostImage(author: SeedAccount, index: number) {
  const marker = feedMarker(index);
  const storageKey = `rich-feed-seed/${author.username}/${marker}.jpg`;
  const seed = `${author.username}-${marker}`;

  return prisma.mediaAsset.upsert({
    where: { storageKey },
    update: {
      publicUrl: imageUrl(seed),
      visibility: MediaVisibility.MEMBERS,
      metadata: {
        demo: true,
        source: "rich-feed-seed",
        systemTags: ["stream-post"],
        marker
      }
    },
    create: {
      ownerUserId: author.id,
      storageKey,
      publicUrl: imageUrl(seed),
      mimeType: "image/jpeg",
      sizeBytes: BigInt(520_000 + (index % 9) * 40_000),
      originalName: `${marker}.jpg`,
      visibility: MediaVisibility.MEMBERS,
      metadata: {
        demo: true,
        source: "rich-feed-seed",
        systemTags: ["stream-post"],
        marker
      },
      createdAt: daysAgo(index % 18, index * 2)
    }
  });
}

async function cleanupPriorRichFeed(accounts: SeedAccount[]) {
  return prisma.feedPost.deleteMany({
    where: {
      authorUserId: { in: accounts.map((account) => account.id) },
      body: { contains: MARKER_PREFIX }
    }
  });
}

async function main() {
  assertLocalQaDatabase();
  const accounts = await getSeedAccounts();
  const cleanup = await cleanupPriorRichFeed(accounts);
  const reactions = [
    FeedReactionType.LIKE,
    FeedReactionType.LOVE,
    FeedReactionType.CARE,
    FeedReactionType.HAHA,
    FeedReactionType.WOW
  ];

  for (let index = 0; index < POST_COUNT; index += 1) {
    const author = accounts[(index * 7) % accounts.length];
    const createdAt = daysAgo(Math.floor(index / 5), -120 + index * 11);
    const shouldAttachImage = index % 3 !== 1;
    const media = shouldAttachImage ? await createPostImage(author, index) : null;

    const post = await prisma.feedPost.create({
      data: {
        authorUserId: author.id,
        body: postBody(index, author),
        visibility: index % 7 === 0 ? FeedVisibility.FRIENDS : FeedVisibility.MEMBERS,
        mediaAssetId: media?.id,
        createdAt
      }
    });

    await prisma.feedPostReaction.createMany({
      data: reactionUsers(accounts, index + 3, 5 + (index % 6), author.id).map((user, reactionIndex) => ({
        postId: post.id,
        userId: user.id,
        type: pick(reactions, index + reactionIndex),
        createdAt: new Date(createdAt.getTime() + (reactionIndex + 1) * 6 * 60 * 1000)
      })),
      skipDuplicates: true
    });

    const commentCount = 2 + (index % 3);
    for (let commentIndex = 0; commentIndex < commentCount; commentIndex += 1) {
      const commenter = accounts[(index * 11 + commentIndex * 13 + 5) % accounts.length];
      const commentMedia = commentIndex === 1 && index % 10 === 0 ? await createPostImage(commenter, POST_COUNT + index) : null;
      const comment = await prisma.feedComment.create({
        data: {
          postId: post.id,
          authorUserId: commenter.id,
          body: pick(comments, index + commentIndex),
          mediaAssetId: commentMedia?.id,
          createdAt: new Date(createdAt.getTime() + (commentIndex + 1) * 14 * 60 * 1000)
        }
      });

      await prisma.feedCommentReaction.createMany({
        data: reactionUsers(accounts, index + commentIndex + 19, 3, commenter.id).map((user, reactionIndex) => ({
          commentId: comment.id,
          userId: user.id,
          type: pick(reactions, reactionIndex + commentIndex),
          createdAt: new Date(createdAt.getTime() + (commentIndex + reactionIndex + 3) * 15 * 60 * 1000)
        })),
        skipDuplicates: true
      });

      if (commentIndex === 0 && index % 4 === 0) {
        const replyAuthor = accounts[(index * 17 + 23) % accounts.length];
        await prisma.feedComment.create({
          data: {
            postId: post.id,
            parentCommentId: comment.id,
            authorUserId: replyAuthor.id,
            body: "Agreed. This should stay easy to scan from the stream, then open cleanly when someone wants the full thread.",
            createdAt: new Date(createdAt.getTime() + 38 * 60 * 1000)
          }
        });
      }
    }
  }

  const finalCount = await prisma.feedPost.count({
    where: {
      authorUserId: { in: accounts.map((account) => account.id) },
      body: { contains: MARKER_PREFIX }
    }
  });

  console.table({
    seedAccounts: accounts.length,
    deletedPriorRichFeedPosts: cleanup.count,
    createdRichFeedPosts: finalCount
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
