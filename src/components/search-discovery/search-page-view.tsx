import Link from "next/link";
import type { SearchView } from "@/modules/search-discovery/types";

function initialFor(title: string) {
  return title.trim().slice(0, 1).toUpperCase() || "?";
}

export function SearchPageView({ search }: { search: SearchView }) {
  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Discovery</p>
            <h1 className="mt-3 text-3xl font-semibold">Search Theta-Space</h1>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
              Search people, groups, The Market, jobs, auditors, writing, and visible posts without exposing private or blocked records.
            </p>
          </div>
          {search.query ? (
            <div className="rounded-md border border-[var(--line)] bg-black/20 px-4 py-3 text-sm">
              <p className="text-[var(--muted)]">Results</p>
              <p className="mt-1 font-semibold text-[var(--gold)]">{search.total} found</p>
            </div>
          ) : null}
        </div>
        <form action="/search" className="mt-6 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            aria-label="Search Theta-Space"
            className="form-field"
            defaultValue={search.query}
            minLength={2}
            name="q"
            placeholder="Search people, groups, listings, jobs, auditors, posts..."
            type="search"
          />
          <button className="btn-primary" type="submit">
            Search
          </button>
        </form>
      </section>

      {!search.query ? (
        <section className="surface rounded-md p-8 text-center">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">Start with two or more letters</h2>
          <p className="mt-2 text-[var(--muted)]">Search is member-only and privacy-aware from the first build slice.</p>
        </section>
      ) : search.total === 0 ? (
        <section className="surface rounded-md p-8 text-center">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">No matching results</h2>
          <p className="mt-2 text-[var(--muted)]">Try a person, group name, listing title, job skill, auditor location, or post phrase.</p>
        </section>
      ) : (
        <div className="grid gap-5">
          {search.groups.map((group) => (
            <section className="surface rounded-md p-5" key={group.kind}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold text-[var(--gold)]">{group.title}</h2>
                <span className="pill rounded-full px-3 py-1 text-xs font-semibold">{group.items.length}</span>
              </div>
              <div className="search-result-grid mt-4">
                {group.items.map((item) => (
                  <Link className="search-result-card" href={item.href} key={`${group.kind}-${item.id}`}>
                    <div className="search-result-image">
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt="" src={item.imageUrl} />
                      ) : (
                        <span>{initialFor(item.title)}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="pill rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em]">
                          {item.badge}
                        </span>
                        {item.meta ? <span className="text-xs text-[var(--muted)]">{item.meta}</span> : null}
                      </div>
                      <h3 className="mt-2 truncate text-lg font-semibold">{item.title}</h3>
                      {item.subtitle ? <p className="mt-1 truncate text-sm text-[var(--muted)]">{item.subtitle}</p> : null}
                      {item.description ? <p className="mt-3 line-clamp-3 text-sm leading-6 text-[var(--muted)]">{item.description}</p> : null}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
