import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { FeedClient } from "@/components/feed/feed-client";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { prisma } from "@/lib/platform/db";
import { isAdminRole } from "@/lib/platform/roles";
import { safeGetFeedPostThread } from "@/modules/feed-stream/feed-stream.service";
import { getEffectivePolicyForUser } from "@/modules/membership-policy/membership-policy.service";

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

  const activeActor = await getActiveAccountActor(session.user.id);
  const [post, actorUser, policy] = await Promise.all([
    safeGetFeedPostThread(params.postId, activeActor.actorUserId),
    prisma.user.findUnique({
      where: { id: activeActor.actorUserId },
      include: { profile: true }
    }),
    getEffectivePolicyForUser(session.user.id)
  ]);

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
        canRequestSupport={isAdminRole(session.user.role) || Boolean(policy?.features["support.createRequest"])}
        currentAuthor={{
          id: activeActor.actorUserId,
          avatarUrl: actorUser?.profile?.avatarUrl,
          displayName: actorUser?.profile?.displayName ?? actorUser?.username ?? session.user.name ?? session.user.username,
          username: actorUser?.username ?? session.user.username
        }}
        defaultExpanded
        initialPosts={[post]}
        initialReplyPostId={searchParams?.reply === "op" ? post.id : undefined}
        isAdmin={isAdminRole(session.user.role)}
        refreshPath={`/api/feed/posts/${post.id}`}
        showThreadLinks={false}
      />
    </AppShell>
  );
}
