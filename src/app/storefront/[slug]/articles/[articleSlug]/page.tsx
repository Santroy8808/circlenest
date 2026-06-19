import Link from "next/link";
import { notFound } from "next/navigation";
import { safeGetPublicBusinessArticle } from "@/modules/business-storefront/business-storefront.service";

export default async function StorefrontArticlePage({ params }: { params: { slug: string; articleSlug: string } }) {
  const result = await safeGetPublicBusinessArticle(params.slug, params.articleSlug);

  if (!result.ok) {
    notFound();
  }

  return (
    <main className="main-surface mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link className="text-sm font-semibold text-[var(--gold)]" href={`/storefront/${result.profile.slug}`}>
          {result.profile.businessName}
        </Link>
        <Link className="btn-secondary" href="/login">
          Member login
        </Link>
      </div>
      <article className="surface rounded-md p-6">
        {result.article.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={result.article.title} className="business-article-cover" src={result.article.coverImageUrl} />
        ) : null}
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Storefront article</p>
        <h1 className="mt-3 text-4xl font-semibold">{result.article.title}</h1>
        {result.article.summary ? <p className="mt-4 text-xl leading-8 text-[var(--muted)]">{result.article.summary}</p> : null}
        <div className="business-article-body mt-8 whitespace-pre-wrap leading-8">{result.article.body}</div>
      </article>
    </main>
  );
}
