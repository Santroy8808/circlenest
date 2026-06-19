import Link from "next/link";
import { notFound } from "next/navigation";
import { safeGetPublicStorefrontBlog } from "@/modules/business-storefront/business-storefront.service";

export default async function StorefrontBlogPage({ params }: { params: { slug: string; manuscriptSlug: string } }) {
  const result = await safeGetPublicStorefrontBlog(params.slug, params.manuscriptSlug);

  if (!result.ok) {
    notFound();
  }

  return (
    <main className="main-surface mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link className="text-sm font-semibold text-[var(--gold)]" href={`/storefront/${result.profile.slug}`}>
          {result.profile.businessName}
        </Link>
        <Link className="btn-secondary" href="/login">
          Member login
        </Link>
      </div>

      <article className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Storefront blog</p>
        <h1 className="mt-3 text-4xl font-semibold">{result.blog.title}</h1>
        {result.blog.summary ? <p className="mt-4 text-xl leading-8 text-[var(--muted)]">{result.blog.summary}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2 text-sm text-[var(--muted)]">
          {result.blog.genre ? <span className="pill rounded-full px-3 py-1">{result.blog.genre}</span> : null}
          <span className="pill rounded-full px-3 py-1">{result.blog.chapterCount} chapters</span>
          <span className="pill rounded-full px-3 py-1">{result.blog.wordCount.toLocaleString()} words</span>
        </div>
      </article>

      <div className="mt-5 grid gap-5">
        {result.blog.chapters.map((chapter, index) => (
          <article className="surface rounded-md p-6" key={chapter.id}>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Chapter {index + 1}</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--gold)]">{chapter.title}</h2>
            {chapter.bodyHtml ? (
              <div className="rich-text-content mt-5" dangerouslySetInnerHTML={{ __html: chapter.bodyHtml }} />
            ) : (
              <div className="rich-text-content mt-5">
                {chapter.bodyText.split(/\n{2,}/).map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </main>
  );
}
