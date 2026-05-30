import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { FeedClient } from "@/components/feed/feed-client";
import { prisma } from "@/lib/db/prisma";
import { getStreamForUser } from "@/modules/stream/stream.service";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [{ mode, posts, hasOlderArchive, fastWindowDays }, profile] = await Promise.all([
    getStreamForUser(session.user.id),
    prisma.profile.findUnique({ where: { userId: session.user.id }, select: { avatarUrl: true, displayName: true } }),
  ]);

  return (
    <AppShell>
      <FeedClient
        initialPosts={posts}
        initialMode={mode}
        currentUserId={session.user.id}
        currentUserAvatarUrl={profile?.avatarUrl ?? null}
        currentUserDisplayName={profile?.displayName ?? session.user.name ?? null}
        initialHasOlderArchive={hasOlderArchive}
        fastWindowDays={fastWindowDays}
      />
    </AppShell>
  );
}
