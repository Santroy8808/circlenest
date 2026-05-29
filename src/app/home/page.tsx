import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { FeedClient } from "@/components/feed/feed-client";
import { getStreamForUser } from "@/modules/stream/stream.service";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { mode, posts, hasOlderArchive, fastWindowDays } = await getStreamForUser(session.user.id);

  return (
    <AppShell>
      <FeedClient
        initialPosts={posts}
        initialMode={mode}
        currentUserId={session.user.id}
        initialHasOlderArchive={hasOlderArchive}
        fastWindowDays={fastWindowDays}
      />
    </AppShell>
  );
}
