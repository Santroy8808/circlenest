import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { FEED_MODES } from "@/lib/feed/modes";
import { canChangeFeedType } from "@/lib/policy/tier-policy";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";

type FeedPatch = {
  mode?: string;
  muteUserId?: string;
  muteUsername?: string;
  muteTopic?: string;
  unfollowTopic?: string;
  hidePostId?: string;
  showLessTopic?: string;
  showMoreTopic?: string;
  reset?: boolean;
};

function parseList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function parseWeights(raw: string | null | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([, v]) => typeof v === "number") as [string, number][]);
  } catch {
    return {};
  }
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, subscriptionTier: true },
  });
  const policy = resolveMemberAccessPolicy(session.user.id, user);

  const body = (await request.json()) as FeedPatch;

  if (body.reset) {
    await prisma.mutedUser.deleteMany({ where: { userId: session.user.id } });
    await prisma.mutedTopic.deleteMany({ where: { userId: session.user.id } });
    await prisma.userFeedPreference.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, mode: "CHRONOLOGICAL", hiddenPostIds: JSON.stringify([]), topicWeights: JSON.stringify({}) },
      update: { mode: "CHRONOLOGICAL", hiddenPostIds: JSON.stringify([]), topicWeights: JSON.stringify({}) },
    });
    return NextResponse.json({ ok: true });
  }

  const pref = await prisma.userFeedPreference.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, mode: "CHRONOLOGICAL", hiddenPostIds: JSON.stringify([]), topicWeights: JSON.stringify({}) },
    update: {},
  });

  const hidden = parseList(pref.hiddenPostIds);
  const weights = parseWeights(pref.topicWeights);

  if (body.mode && FEED_MODES.includes(body.mode as (typeof FEED_MODES)[number])) {
    if (!canChangeFeedType(policy)) {
      return NextResponse.json({ error: "Feed type changes are not allowed on this tier." }, { status: 403 });
    }
    await prisma.userFeedPreference.update({ where: { userId: session.user.id }, data: { mode: body.mode } });
  }

  if (body.muteUserId) {
    await prisma.mutedUser.upsert({
      where: { userId_mutedUserId: { userId: session.user.id, mutedUserId: body.muteUserId } },
      create: { userId: session.user.id, mutedUserId: body.muteUserId },
      update: {},
    });
  }

  if (body.muteUsername) {
    const user = await prisma.user.findUnique({ where: { username: body.muteUsername } });
    if (user && user.id !== session.user.id) {
      await prisma.mutedUser.upsert({
        where: { userId_mutedUserId: { userId: session.user.id, mutedUserId: user.id } },
        create: { userId: session.user.id, mutedUserId: user.id },
        update: {},
      });
    }
  }

  if (body.muteTopic) {
    await prisma.mutedTopic.upsert({
      where: { userId_topic: { userId: session.user.id, topic: body.muteTopic } },
      create: { userId: session.user.id, topic: body.muteTopic },
      update: {},
    });
  }

  if (body.unfollowTopic) {
    await prisma.followedTopic.deleteMany({ where: { userId: session.user.id, topic: body.unfollowTopic } });
  }

  if (body.hidePostId) {
    const next = Array.from(new Set([...hidden, body.hidePostId]));
    await prisma.userFeedPreference.update({ where: { userId: session.user.id }, data: { hiddenPostIds: JSON.stringify(next) } });
  }

  if (body.showLessTopic) {
    weights[body.showLessTopic] = (weights[body.showLessTopic] ?? 0) - 1;
    await prisma.userFeedPreference.update({ where: { userId: session.user.id }, data: { topicWeights: JSON.stringify(weights) } });
  }

  if (body.showMoreTopic) {
    weights[body.showMoreTopic] = (weights[body.showMoreTopic] ?? 0) + 1;
    await prisma.userFeedPreference.update({ where: { userId: session.user.id }, data: { topicWeights: JSON.stringify(weights) } });
  }

  return NextResponse.json({ ok: true });
}
