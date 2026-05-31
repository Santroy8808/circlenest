import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { FeedClient } from "@/components/feed/feed-client";
import { prisma } from "@/lib/db/prisma";
import { getStreamForUser } from "@/modules/stream/stream.service";
import type { FeedMode } from "@/lib/feed/modes";

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
  }

  const profile = await prisma.profile.findUnique({
    where: { userId: session.user.id },
    select: { avatarUrl: true, displayName: true },
  });

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
