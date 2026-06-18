import Link from "next/link";
import type { AdsManagerView } from "@/modules/ads-credits/types";

export function AdsManager({ adsManager }: { adsManager: AdsManagerView }) {
  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Ads Credits</p>
            <h1 className="mt-3 text-3xl font-semibold">Ad campaign manager</h1>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
              Ads use labeled reserved placements. They do not appear inside listings, events, posts, or detail content.
            </p>
          </div>
          {adsManager.canCreate ? (
            <Link className="btn-primary" href="/ads/create">
              Create ad
            </Link>
          ) : null}
        </div>
        <p className="mt-5 text-sm text-[var(--gold)]">{adsManager.platformCredits} platform credits available.</p>
        {!adsManager.canCreate && adsManager.reason ? <p className="mt-3 text-sm text-[var(--muted)]">{adsManager.reason}</p> : null}
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Campaigns</h2>
        <div className="mt-5 grid gap-3">
          {adsManager.campaigns.length > 0 ? (
            adsManager.campaigns.map((campaign) => (
              <article className="module-card rounded-md p-5" key={campaign.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold">{campaign.title}</h3>
                    <p className="mt-2 leading-6 text-[var(--muted)]">{campaign.body}</p>
                  </div>
                  <span className="pill rounded-full px-3 py-1 text-xs">{campaign.status}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                  <span className="pill rounded-full px-3 py-1">{campaign.placementLabel}</span>
                  <span className="pill rounded-full px-3 py-1">
                    {campaign.spentCredits}/{campaign.totalBudgetCredits} credits spent
                  </span>
                  {campaign.targetLocation ? <span className="pill rounded-full px-3 py-1">Location: {campaign.targetLocation}</span> : null}
                  {campaign.targetClassification ? (
                    <span className="pill rounded-full px-3 py-1">Classification: {campaign.targetClassification}</span>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <p className="rounded-md border border-dashed border-[var(--line)] p-5 text-[var(--muted)]">No ad campaigns yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
