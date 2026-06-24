import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { FeedClient } from "@/components/feed/feed-client";
import { AppShell } from "@/components/platform/app-shell";
import { safeGetFeedPostThread } from "@/modules/feed-stream/feed-stream.service";

export default async function FeedPostThreadPage({
  params,
  searchParams
}: {
  params: { postId: string };
  searchParams?: { reply?: string };
}) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/posts/${params.postId}`);
  }

  const post = await safeGetFeedPostThread(params.postId);

  if (!post) {
    notFound();
  }

  return (
    <AppShell>
      <div className="mb-4">
        <Link className="feed-thread-toggle" href="/home">
          Back to stream
        </Link>
      </div>
      <FeedClient
        currentAuthor={{
          id: session.user.id,
          displayName: session.user.name ?? session.user.username,
          username: session.user.username
        }}
        defaultExpanded
        initialPosts={[post]}
        initialReplyPostId={searchParams?.reply === "op" ? post.id : undefined}
        refreshPath={`/api/feed/posts/${post.id}`}
        showThreadLinks={false}
      />
    </AppShell>
  );
}
