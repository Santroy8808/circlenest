import Link from "next/link";
import {
  fundraiserCategoryOptions,
  type FundraiserCardView,
  type FundraiserCreateState
} from "@/modules/fundraisers-funds/types";

function formatMoney(cents: number | null, currency: string) {
  if (cents === null) return "Open goal";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function FundraisersDirectory({
  createState,
  fundraisers,
  selectedCategory
}: {
  createState: FundraiserCreateState;
  fundraisers: FundraiserCardView[];
  selectedCategory?: string;
}) {
  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Fundraisers</p>
            <h1 className="mt-3 text-3xl font-semibold">Member fundraiser campaigns</h1>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
              Campaigns are payment-ready but do not move money until processor integration is explicitly added.
            </p>
          </div>
          {createState.viewerCanCreate ? (
            <Link className="btn-primary" href="/fundraisers/create">
              Create fundraiser
            </Link>
          ) : null}
        </div>
        {createState.fundraiserLimit !== null ? (
          <p className="mt-4 text-sm text-[var(--gold)]">
            {createState.fundraisersRemaining} of {createState.fundraiserLimit} fundraiser slots left this month.
          </p>
        ) : null}
        {!createState.viewerCanCreate && createState.reason ? <p className="mt-4 text-sm text-[var(--muted)]">{createState.reason}</p> : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <Link className={`btn-secondary ${!selectedCategory ? "border-[var(--line-strong)]" : ""}`} href="/fundraisers">
            All
          </Link>
          {fundraiserCategoryOptions.map((option) => (
            <Link
              className={`btn-secondary ${selectedCategory === option.value ? "border-[var(--line-strong)]" : ""}`}
              href={`/fundraisers?category=${option.value}`}
              key={option.value}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="fundraiser-grid">
        {fundraisers.length > 0 ? (
          fundraisers.map((fundraiser) => (
            <Link className="module-card rounded-md p-5" href={`/fundraisers/${fundraiser.slug}`} key={fundraiser.id}>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-xl font-semibold text-[var(--gold)]">{fundraiser.title}</h2>
                <span className="pill rounded-full px-3 py-1 text-xs">{fundraiser.categoryLabel}</span>
              </div>
              <p className="mt-3 leading-6 text-[var(--muted)]">{fundraiser.summary ?? "No summary yet."}</p>
              <div className="mt-5">
                <div className="h-2 overflow-hidden rounded-full bg-black/30">
                  <div
                    className="h-full rounded-full bg-[var(--blue)]"
                    style={{
                      width: fundraiser.goalAmountCents
                        ? `${Math.min(100, Math.round((fundraiser.pledgedAmountCents / fundraiser.goalAmountCents) * 100))}%`
                        : "8%"
                    }}
                  />
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {formatMoney(fundraiser.pledgedAmountCents, fundraiser.currency)} pledged of {formatMoney(fundraiser.goalAmountCents, fundraiser.currency)}
                </p>
              </div>
            </Link>
          ))
        ) : (
          <p className="surface rounded-md p-6 text-[var(--muted)]">No fundraisers match this view yet.</p>
        )}
      </section>
    </div>
  );
}
