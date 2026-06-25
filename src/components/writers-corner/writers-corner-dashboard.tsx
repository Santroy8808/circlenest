import Link from "next/link";
import type { ManuscriptCardView, WriterAccessState } from "@/modules/writers-corner/types";

export function WritersCornerDashboard({ access, manuscripts }: { access: WriterAccessState; manuscripts: ManuscriptCardView[] }) {
  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Writers Corner</p>
            <h1 className="mt-3 text-3xl font-semibold">Manuscripts</h1>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
              Build manuscripts, add chapters, and publish readable chapter cards for members.
            </p>
          </div>
          {access.canWrite ? (
            <Link className="btn-primary" href="/writers-corner/create">
              Create manuscript
            </Link>
          ) : null}
        </div>
        {!access.canWrite && access.reason ? <p className="mt-4 text-sm text-[var(--muted)]">{access.reason}</p> : null}
      </section>

      <section className="grid gap-3">
        {manuscripts.length > 0 ? (
          manuscripts.map((manuscript) => (
            <Link className="module-card rounded-md p-5" href={`/writers-corner/${manuscript.slug}`} key={manuscript.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-[var(--gold)]">{manuscript.title}</h2>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    {manuscript.genre ?? "No genre"} by {manuscript.author.displayName}
                  </p>
                </div>
                <span className="pill rounded-full px-3 py-1 text-xs">
                  {manuscript.chapterCount} chapters / {manuscript.wordCount} words / {manuscript.subscriberCount} subscribers
                </span>
              </div>
              <p className="mt-4 leading-6 text-[var(--muted)]">{manuscript.summary ?? "No summary yet."}</p>
            </Link>
          ))
        ) : (
          <p className="surface rounded-md p-6 text-[var(--muted)]">No manuscripts yet.</p>
        )}
      </section>
    </div>
  );
}
