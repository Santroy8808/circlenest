import { SocialRelationshipType } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/platform/db";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { AppShell } from "@/components/platform/app-shell";
import { ProfileCard } from "@/components/profile/profile-card";
import { getPublicProfileByUsername } from "@/modules/profile-identity/profile-identity.service";
import { safeListProfileFeedPosts } from "@/modules/feed-stream/feed-stream.service";
import { FeedClient } from "@/components/feed/feed-client";
import { redirect } from "next/navigation";

export default async function PublicProfilePage({ params }: { params: { username: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/profile/${params.username}`);
  }

  const profile = await getPublicProfileByUsername(params.username, session.user.id);
  const isOwner = Boolean(session?.user?.username && session.user.username === params.username.toLowerCase());
  const activeActor = await getActiveAccountActor(session.user.id);
  const profilePosts = profile ? await safeListProfileFeedPosts(profile.id, 20) : [];
  const actorUser = profile
    ? await prisma.user.findUnique({
        where: { id: activeActor.actorUserId },
        include: { profile: true }
      })
    : null;
  const canPostToProfile = profile
    ? isOwner ||
      (profile.allowProfilePosts &&
        profile.viewerRelationships.some(
          (relationship) => relationship === SocialRelationshipType.FRIEND || relationship === SocialRelationshipType.FAMILY
        ))
    : false;

  return (
    <AppShell>
      {profile ? (
        <>
          <ProfileCard profile={profile} ownerControls={isOwner} />
          <section className="mt-5">
            <FeedClient
              currentAuthor={{
                id: activeActor.actorUserId,
                avatarUrl: actorUser?.profile?.avatarUrl,
                displayName: actorUser?.profile?.displayName ?? actorUser?.username ?? session.user.name ?? session.user.username,
                username: actorUser?.username ?? session.user.username
              }}
              initialPosts={profilePosts}
              postTargetProfileUserId={profile.id}
              refreshPath={`/api/feed/profile/${profile.username}`}
              showComposerTrigger={canPostToProfile}
            />
          </section>
        </>
      ) : (
        <section className="surface rounded-md p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Profile</p>
          <h1 className="mt-3 text-3xl font-semibold">Profile unavailable</h1>
          <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
            That profile was not found, is private, or the database is unavailable in this local environment.
          </p>
        </section>
      )}
    </AppShell>
  );
}
