import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { StorefrontForumTopicClient } from "@/components/business-storefront/storefront-forum-topic-client";
import type { StorefrontForumPostView } from "@/modules/storefront-forum/types";
import { safeGetStorefrontForumTopic } from "@/modules/storefront-forum/storefront-forum.service";
import { resolveMembershipRouteAccess } from "@/modules/membership-policy/route-access";

function removeManagementControls(post: StorefrontForumPostView): StorefrontForumPostView {
  return {
    ...post,
    viewerCanDelete: false,
    replies: post.replies?.map(removeManagementControls)
  };
}

export default async function StorefrontForumTopicPage({ params }: { params: { slug: string; topicId: string } }) {
  const session = await auth();
  const result = await safeGetStorefrontForumTopic(params.slug, params.topicId, session?.user && !session.user.revoked ? session.user.id : null);

  if (!result.ok) {
    notFound();
  }

  const managementAccess = session?.user && !session.user.revoked
    ? await resolveMembershipRouteAccess(session.user.id, "businessManage", "page")
    : { allowed: false as const };
  const viewerCanManage = result.viewerCanManage && managementAccess.allowed;
  const topic = viewerCanManage
    ? result.topic
    : {
        ...result.topic,
        viewerCanDelete: false,
        posts: result.topic.posts.map(removeManagementControls)
      };

  return (
    <main className="public-storefront-surface">
      <div className="public-storefront-shell">
        <div className="public-storefront-top flex flex-wrap items-center justify-between gap-3">
          <Link className="text-sm font-semibold text-[var(--gold)]" href="/">
            Theta-Space
          </Link>
          <Link className="btn-secondary" href="/login">
            Member login
          </Link>
        </div>
        <StorefrontForumTopicClient profile={result.profile} topic={topic} viewerCanManage={viewerCanManage} />
      </div>
    </main>
  );
}
