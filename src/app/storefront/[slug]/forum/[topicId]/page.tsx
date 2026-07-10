import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { StorefrontForumTopicClient } from "@/components/business-storefront/storefront-forum-topic-client";
import { safeGetStorefrontForumTopic } from "@/modules/storefront-forum/storefront-forum.service";

export default async function StorefrontForumTopicPage({ params }: { params: { slug: string; topicId: string } }) {
  const session = await auth();
  const result = await safeGetStorefrontForumTopic(params.slug, params.topicId, session?.user && !session.user.revoked ? session.user.id : null);

  if (!result.ok) {
    notFound();
  }

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
        <StorefrontForumTopicClient profile={result.profile} topic={result.topic} viewerCanManage={result.viewerCanManage} />
      </div>
    </main>
  );
}
