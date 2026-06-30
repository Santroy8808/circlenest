import { AdPlacement } from "@prisma/client";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HomeStreamWorkspace } from "@/components/home/home-stream-workspace";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { prisma } from "@/lib/platform/db";
import { timeServerStep } from "@/lib/platform/server-timing";
import { getAdPlacementPool, recordReservedStreamOrganicFeedUnits } from "@/modules/ads-credits/ads-credits.service";
import { safeListChatThreads } from "@/modules/chat-messages/chat-messages.service";
import { safeListFeedPosts } from "@/modules/feed-stream/feed-stream.service";

export default async function AppHomePage() {
  const session = await timeServerStep("home.auth", auth());

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/home");
  }
  const activeActor = await timeServerStep("home.actor", getActiveAccountActor(session.user.id));
  const [posts, profile, actorUser, latestAlert, scienceProfile, privateProfile, chatThreads] = await Promise.all([
    timeServerStep("home.feed-posts", safeListFeedPosts(20, activeActor.actorUserId)),
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
    timeServerStep("home.scientology-profile", prisma.scientologyProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true }
    })),
    timeServerStep("home.private-profile", prisma.profile.findUnique({
      where: { userId: session.user.id },
      select: { userId: true }
    })),
    timeServerStep("home.chat-threads", safeListChatThreads(activeActor.actorUserId))
  ]);

  if (!scienceProfile && privateProfile) {
    redirect("/profile/edit?next=/profile/scientology");
  }

  await timeServerStep("home.record-feed-units", recordReservedStreamOrganicFeedUnits(session.user.id, posts.length, "DESKTOP"));
  const reservedStreamAds = await timeServerStep("home.reserved-stream-ads", getAdPlacementPool({
    viewerUserId: session.user.id,
    placement: AdPlacement.RESERVED_STREAM,
    limit: 1
  }), { placement: "RESERVED_STREAM" });
  const displayName = profile?.displayName ?? (activeActor.actorUserId === session.user.id ? session.user.name : null) ?? actorUser?.username ?? session.user.username;

  return (
    <AppShell>
      <HomeStreamWorkspace
        bannerUrl={profile?.bannerUrl}
        currentAuthor={{
          id: activeActor.actorUserId,
          avatarUrl: profile?.avatarUrl,
          displayName,
          username: actorUser?.username ?? session.user.username
        }}
        initialChatThreads={chatThreads}
        initialReservedStreamAds={reservedStreamAds}
        initialPosts={posts}
        latestAlert={latestAlert}
      />
    </AppShell>
  );
}
