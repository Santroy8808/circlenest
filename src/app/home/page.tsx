import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { FeedClient } from "@/components/feed/feed-client";
import { getStreamForUser } from "@/modules/stream/stream.service";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { mode, posts } = await getStreamForUser(session.user.id);

  return (
    <AppShell>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Home Stream</h1>
        <span className="rounded bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700">Mode: {mode}</span>
      </div>
      <FeedClient initialPosts={posts} currentUserId={session.user.id} />
    </AppShell>
  );
}
