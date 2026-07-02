import Link from "next/link";
import { EndAdCampaignButton } from "@/components/ads-credits/end-ad-campaign-button";
import type { AdsManagerView } from "@/modules/ads-credits/types";

function isExternalUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export function BusinessCampaigns({ adsManager }: { adsManager: AdsManagerView }) {
  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Business Center</p>
            <h1 className="mt-3 text-3xl font-semibold">Campaigns</h1>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
              Active and historical ad campaigns for this account. End live campaigns here when the promotion is complete.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="btn-secondary" href="/business-center">
              Center
            </Link>
            <Link className="btn-primary" href="/business-center/create-ad">
              Create
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3">
        {adsManager.campaigns.length > 0 ? (
          adsManager.campaigns.map((campaign) => (
            <article className="surface business-campaign-card rounded-md p-5" key={campaign.id}>
              <div className="grid gap-4 md:grid-cols-[170px_minmax(0,1fr)]">
                {campaign.imageUrl ? (
                  <a
                    className="ad-manager-image"
                    href={campaign.destinationUrl ?? "#"}
                    rel={campaign.destinationUrl && isExternalUrl(campaign.destinationUrl) ? "noreferrer" : undefined}
                    target={campaign.destinationUrl && isExternalUrl(campaign.destinationUrl) ? "_blank" : undefined}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt={campaign.title} src={campaign.imageUrl} />
                  </a>
                ) : (
                  <div className="ad-manager-image is-empty">No image</div>
                )}
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold">{campaign.title}</h2>
                      <p className="mt-2 leading-6 text-[var(--muted)]">{campaign.body}</p>
                    </div>
                    <span className="pill rounded-full px-3 py-1 text-xs">{campaign.status}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                    <span className="pill rounded-full px-3 py-1">{campaign.placementLabel}</span>
                    <span className="pill rounded-full px-3 py-1">{campaign.destinationKind.toLowerCase().replace("_", " ")}</span>
                    <span className="pill rounded-full px-3 py-1">
                      {campaign.spentCredits} / {campaign.totalBudgetCredits} credits
                    </span>
                    <span className="pill rounded-full px-3 py-1">{campaign.remainingCredits} left</span>
                    {campaign.endsAt ? <span className="pill rounded-full px-3 py-1">Ends {new Date(campaign.endsAt).toLocaleDateString()}</span> : null}
                    {campaign.targetLocation ? <span className="pill rounded-full px-3 py-1">Location: {campaign.targetLocation}</span> : null}
                    <span className="pill rounded-full px-3 py-1">
                      {campaign.targetInterestLabels.length > 0 ? campaign.targetInterestLabels.join(", ") : "Broad interests"}
                    </span>
                    {campaign.subscriberTargetLabel ? <span className="pill rounded-full px-3 py-1">Subscribers: {campaign.subscriberTargetLabel}</span> : null}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {campaign.destinationUrl ? (
                      isExternalUrl(campaign.destinationUrl) ? (
                        <a className="text-sm font-semibold text-[var(--gold)] underline" href={campaign.destinationUrl} rel="noreferrer" target="_blank">
                          Destination
                        </a>
                      ) : (
                        <Link className="text-sm font-semibold text-[var(--gold)] underline" href={campaign.destinationUrl}>
                          Destination
                        </Link>
                      )
                    ) : null}
                    {campaign.status === "ACTIVE" || campaign.status === "PAUSED" || campaign.status === "DRAFT" ? (
                      <EndAdCampaignButton campaignId={campaign.id} />
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          ))
        ) : (
          <section className="surface rounded-md p-6">
            <p className="text-[var(--muted)]">No ad campaigns yet.</p>
            <Link className="btn-primary mt-4 inline-flex" href="/business-center/create-ad">
              Create
            </Link>
          </section>
        )}
      </section>
    </div>
  );
}
