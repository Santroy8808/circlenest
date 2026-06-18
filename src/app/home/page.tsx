import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { FeedClient } from "@/components/feed/feed-client";
import { AppShell } from "@/components/platform/app-shell";
import { safeListFeedPosts } from "@/modules/feed-stream/feed-stream.service";

export default async function AppHomePage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/home");
  }
  const posts = await safeListFeedPosts();

  return (
    <AppShell>
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">My Stream</p>
        <h1 className="mt-3 text-3xl font-semibold">Welcome, {session.user.name ?? session.user.username}</h1>
        <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
          The stream foundation is live: posts, comments, quick replies, and reactions update without full page reloads.
        </p>
      </section>
      <section className="mt-5">
        <FeedClient initialPosts={posts} />
      </section>
    </AppShell>
  );
}
