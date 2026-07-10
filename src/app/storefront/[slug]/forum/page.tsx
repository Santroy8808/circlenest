import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { StorefrontForumClient } from "@/components/business-storefront/storefront-forum-client";
import { safeListStorefrontForumTopics } from "@/modules/storefront-forum/storefront-forum.service";

export default async function StorefrontForumPage({ params }: { params: { slug: string } }) {
  const session = await auth();
  const result = await safeListStorefrontForumTopics(params.slug, {
    viewerUserId: session?.user && !session.user.revoked ? session.user.id : null
  });

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
        <StorefrontForumClient initialForum={result.forum} />
      </div>
    </main>
  );
}
