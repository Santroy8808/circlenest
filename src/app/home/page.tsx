import { AdPlacement } from "@prisma/client";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HomeStreamWorkspace } from "@/components/home/home-stream-workspace";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { prisma } from "@/lib/platform/db";
import { isAdminRole } from "@/lib/platform/roles";
import { timeServerStep } from "@/lib/platform/server-timing";
import { getAdPlacementPool, recordReservedStreamOrganicFeedUnits } from "@/modules/ads-credits/ads-credits.service";
import { safeListChatThreads } from "@/modules/chat-messages/chat-messages.service";
import { listFeedPostsPage } from "@/modules/feed-stream/feed-stream.service";
import { getEffectivePolicyForUser } from "@/modules/membership-policy/membership-policy.service";

async function safeHomeFeedPage(viewerUserId: string) {
  try {
    return await listFeedPostsPage({ limit: 20 }, viewerUserId);
  } catch {
    return { pinnedItems: [], items: [], nextCursor: null, hasMore: false };
  }
}

export default async function AppHomePage() {
  const session = await timeServerStep("home.auth", auth());

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/home");
  }
  const activeActor = await timeServerStep("home.actor", getActiveAccountActor(session.user.id));
  const [feedPage, profile, actorUser, latestAlert, chatThreads, policy] = await Promise.all([
    timeServerStep("home.feed-posts", safeHomeFeedPage(activeActor.actorUserId)),
    timeServerStep("home.profile", prisma.profile.findUnique({
      where: { userId: activeActor.actorUserId },
      select: {
        avatarUrl: true,
        bannerUrl: true,
        displayName: true
      }
    })),
    timeServerStep("home.actor-user", prisma.user.findUnique({
      where: { id: activeActor.actorUserId },
      select: {
        username: true
      }
    })),
    timeServerStep("home.latest-alert", prisma.alert.findFirst({
      where: {
        userId: session.user.id,
        readAt: null
      },
      orderBy: {
        createdAt: "desc"
      },
      select: {
        title: true,
        body: true,
        href: true
      }
    })),
    timeServerStep("home.chat-threads", safeListChatThreads(activeActor.actorUserId)),
    timeServerStep("home.membership-policy", getEffectivePolicyForUser(session.user.id))
  ]);

  const posts = [...feedPage.pinnedItems, ...feedPage.items];
  await timeServerStep("home.record-feed-units", recordReservedStreamOrganicFeedUnits(session.user.id, posts.length, "DESKTOP"));
  const reservedStreamAds = await timeServerStep("home.reserved-stream-ads", getAdPlacementPool({
    viewerUserId: session.user.id,
    placement: AdPlacement.RESERVED_STREAM,
    limit: 1
  }), { placement: "RESERVED_STREAM" });
  const displayName = profile?.displayName ?? (activeActor.actorUserId === session.user.id ? session.user.name : null) ?? actorUser?.username ?? session.user.username;
  const isAdmin = isAdminRole(session.user.role);

  return (
    <AppShell>
      <HomeStreamWorkspace
        bannerUrl={profile?.bannerUrl}
        canRequestSupport={isAdmin || Boolean(policy?.features["support.createRequest"])}
        currentAuthor={{
          id: activeActor.actorUserId,
          avatarUrl: profile?.avatarUrl,
          displayName,
          username: actorUser?.username ?? session.user.username
        }}
        initialChatThreads={chatThreads}
        initialFeedHasMore={feedPage.hasMore}
        initialFeedNextCursor={feedPage.nextCursor}
        initialReservedStreamAds={reservedStreamAds}
        initialPosts={posts}
        isAdmin={isAdmin}
        latestAlert={latestAlert}
        showStreamFilters={Boolean(policy?.features["feed.changeType"])}
      />
    </AppShell>
  );
}
