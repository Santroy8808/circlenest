import Link from "next/link";
import type { ManuscriptDetailView } from "@/modules/writers-corner/types";
import { ManuscriptSubscribeButton } from "@/components/writers-corner/manuscript-subscribe-button";
import { StorefrontPublishToggle } from "@/components/writers-corner/storefront-publish-toggle";

export function ManuscriptDetail({ manuscript }: { manuscript: ManuscriptDetailView }) {
  const promoteParams = new URLSearchParams({
    title: `Read ${manuscript.title}`,
    body: manuscript.summary ?? `New chapters are available from ${manuscript.author.displayName}.`,
    destinationKind: "EXTERNAL_URL",
    customDestinationUrl: `/writers-corner/${manuscript.slug}`,
    targetInterestCategories: "WRITERS"
  });

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">{manuscript.genre ?? "Manuscript"}</p>
            <h1 className="mt-3 text-3xl font-semibold">{manuscript.title}</h1>
            <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">{manuscript.summary ?? "No summary yet."}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
              <span className="pill rounded-full px-3 py-1">{manuscript.chapterCount} chapters</span>
              <span className="pill rounded-full px-3 py-1">{manuscript.wordCount} words</span>
              <span className="pill rounded-full px-3 py-1">{manuscript.subscriberCount} subscribers</span>
            </div>
          </div>
          {manuscript.viewerCanEdit ? (
            <div className="flex flex-wrap gap-3">
              <Link className="btn-secondary" href={`/ads/create?${promoteParams.toString()}`}>
                Promote manuscript
              </Link>
              <Link className="btn-primary" href={`/writers-corner/${manuscript.slug}/chapters/create`}>
                Create chapter
              </Link>
            </div>
          ) : (
            <ManuscriptSubscribeButton
              initialSubscribed={manuscript.viewerSubscribed}
              manuscriptSlug={manuscript.slug}
              title={manuscript.title}
            />
          )}
        </div>
      </section>

      <StorefrontPublishToggle manuscript={manuscript} />

      <section className="grid gap-3">
        {manuscript.chapters.length > 0 ? (
          manuscript.chapters.map((chapter) => (
            <Link className="writer-chapter-card" href={`/writers-corner/${manuscript.slug}/chapters/${chapter.id}`} key={chapter.id}>
              <div>
                <h2 className="text-xl font-semibold">{chapter.title}</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">Updated {new Date(chapter.updatedAt).toLocaleDateString()}</p>
              </div>
              <span className="pill rounded-full px-3 py-1 text-xs">{chapter.wordCount} words</span>
            </Link>
          ))
        ) : (
          <p className="surface rounded-md p-6 text-[var(--muted)]">No chapters yet.</p>
        )}
      </section>
    </div>
  );
}
