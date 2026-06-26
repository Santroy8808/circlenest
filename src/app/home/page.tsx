import { AdPlacement } from "@prisma/client";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { FeedClient } from "@/components/feed/feed-client";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { prisma } from "@/lib/platform/db";
import { getAdPlacementPool, recordReservedStreamOrganicFeedUnits } from "@/modules/ads-credits/ads-credits.service";
import { safeListFeedPosts } from "@/modules/feed-stream/feed-stream.service";

export default async function AppHomePage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/home");
  }
  const activeActor = await getActiveAccountActor(session.user.id);
  const [posts, profile, actorUser, latestAlert, scienceProfile, privateProfile] = await Promise.all([
    safeListFeedPosts(20, activeActor.actorUserId),
    prisma.profile.findUnique({
      where: { userId: activeActor.actorUserId },
      select: {
        avatarUrl: true,
        bannerUrl: true,
        displayName: true
      }
    }),
    prisma.user.findUnique({
      where: { id: activeActor.actorUserId },
      select: {
        username: true
      }
    }),
    prisma.alert.findFirst({
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
    }),
    prisma.scientologyProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true }
    }),
    prisma.profile.findUnique({
      where: { userId: session.user.id },
      select: { userId: true }
    })
  ]);

  if (!scienceProfile && privateProfile) {
    redirect("/profile/edit?next=/profile/scientology");
  }

  await recordReservedStreamOrganicFeedUnits(session.user.id, posts.length, "DESKTOP");
  const reservedStreamAds = await getAdPlacementPool({
    viewerUserId: session.user.id,
    placement: AdPlacement.RESERVED_STREAM,
    limit: 1
  });
  const displayName = profile?.displayName ?? (activeActor.actorUserId === session.user.id ? session.user.name : null) ?? actorUser?.username ?? session.user.username;

  return (
    <AppShell>
      <section
        className="home-stream-hero surface rounded-md"
        style={profile?.bannerUrl ? { backgroundImage: `linear-gradient(90deg, rgba(8, 11, 16, 0.86), rgba(8, 11, 16, 0.42)), url(${profile.bannerUrl})` } : undefined}
      >
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">My Stream</p>
          <h1 className="mt-3 text-3xl font-semibold">Welcome, {displayName}</h1>
          <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">Share updates, pictures, replies, and reactions with your Theta-Space network.</p>
        </div>
        {latestAlert ? (
          <a className="home-login-alert" href={latestAlert.href ?? "/alerts"}>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">System notice</span>
            <strong>{latestAlert.title}</strong>
            {latestAlert.body ? <span>{latestAlert.body}</span> : null}
          </a>
        ) : null}
      </section>
      <section className="mt-5">
        <FeedClient
          currentAuthor={{
            id: activeActor.actorUserId,
            avatarUrl: profile?.avatarUrl,
            displayName,
            username: actorUser?.username ?? session.user.username
          }}
          initialReservedStreamAds={reservedStreamAds}
          initialPosts={posts}
        />
      </section>
    </AppShell>
  );
}
