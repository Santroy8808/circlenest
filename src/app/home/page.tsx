import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { FeedClient } from "@/components/feed/feed-client";
import { TierOnboardingCard } from "@/components/onboarding/tier-onboarding-card";
import { prisma } from "@/lib/db/prisma";
import { ADMIN_MODE_COOKIE_NAME, hasAdminModeAccess } from "@/lib/security/admin-mode";
import { isAdminUser } from "@/lib/auth/admin";
import { getStreamForUser } from "@/modules/stream/stream.service";
import { canChangeFeedType } from "@/lib/policy/tier-policy";
import type { FeedMode } from "@/lib/feed/modes";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  let mode: FeedMode = "CHRONOLOGICAL";
  let posts: Awaited<ReturnType<typeof getStreamForUser>>["posts"] = [];
  let hasOlderArchive = false;
  let fastWindowDays = 14;

  try {
    const stream = await getStreamForUser(session.user.id);
    mode = stream.mode;
    posts = stream.posts;
    hasOlderArchive = stream.hasOlderArchive;
    fastWindowDays = stream.fastWindowDays;
  } catch (error) {
    console.error("[home] stream fallback triggered", error);
    const fallbackRows = await prisma.post.findMany({
      where: {
        OR: [
          { authorId: session.user.id },
          { audience: "ALL" },
        ],
      },
      include: {
        author: { select: { username: true, fullName: true, profile: { select: { displayName: true, avatarUrl: true } } } },
        comments: {
          select: {
            id: true,
            content: true,
            parentCommentId: true,
            createdAt: true,
            author: { select: { username: true, fullName: true, profile: { select: { displayName: true, avatarUrl: true } } } },
          },
          orderBy: { createdAt: "asc" },
        },
        reactions: true,
        poll: { include: { options: { include: { _count: { select: { votes: true } } } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    posts = fallbackRows.map((row) => ({
      ...row,
      explanation: "Showing fallback stream while feed rebuilds.",
    }));
    mode = "CHRONOLOGICAL";
    hasOlderArchive = false;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { createdAt: true, role: true, subscriptionTier: true },
  });
  const policy = resolveMemberAccessPolicy(session.user.id, user);
  const adminAccess = await isAdminUser(session.user.id);
  const showAdminFeatures = Boolean(user && adminAccess && hasAdminModeAccess(session.user.id, cookies().get(ADMIN_MODE_COOKIE_NAME)?.value));
  const profile = await prisma.profile.findUnique({
    where: { userId: session.user.id },
    select: { avatarUrl: true, displayName: true },
  });
  const accountAgeDays = user?.createdAt ? Math.max(0, Math.floor((Date.now() - user.createdAt.getTime()) / 86_400_000)) : 0;

  return (
    <AppShell>
      <div className="mx-auto mb-3 w-full max-w-[720px]">
        <TierOnboardingCard
          userId={session.user.id}
          policy={policy}
          showAdminFeatures={showAdminFeatures}
          displayName={profile?.displayName ?? session.user.name ?? null}
          accountAgeDays={accountAgeDays}
        />
      </div>
      <FeedClient
        initialPosts={posts}
        initialMode={mode}
        currentUserId={session.user.id}
        currentUserAvatarUrl={profile?.avatarUrl ?? null}
        currentUserDisplayName={profile?.displayName ?? session.user.name ?? null}
        initialHasOlderArchive={hasOlderArchive}
        fastWindowDays={fastWindowDays}
        canChangeFeedType={canChangeFeedType(policy)}
      />
    </AppShell>
  );
}
