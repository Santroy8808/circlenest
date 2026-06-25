import Link from "next/link";
import { AdCreditCheckoutButton } from "@/components/ads-credits/ad-credit-checkout-button";
import type { AdsManagerView } from "@/modules/ads-credits/types";

function isExternalUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

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
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Buy platform credits</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Credits are granted only after Stripe confirms payment through the webhook.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {adsManager.creditPackages.length > 0 ? (
            adsManager.creditPackages.map((creditPackage) => (
              <article className="module-card rounded-md p-4" key={creditPackage.key}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">{creditPackage.label}</h3>
                    <p className="mt-1 text-sm text-[var(--muted)]">{creditPackage.creditAmount.toLocaleString()} credits</p>
                  </div>
                  <span className="pill rounded-full px-3 py-1 text-xs">${(creditPackage.priceCents / 100).toFixed(2)}</span>
                </div>
                {creditPackage.description ? <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{creditPackage.description}</p> : null}
                {!creditPackage.checkoutReady ? (
                  <p className="mt-3 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">
                    Stripe checkout is not configured for this package yet.
                  </p>
                ) : null}
                <div className="mt-4">
                  <AdCreditCheckoutButton disabled={!creditPackage.checkoutReady} packageKey={creditPackage.key} />
                </div>
              </article>
            ))
          ) : (
            <p className="rounded-md border border-dashed border-[var(--line)] p-5 text-[var(--muted)]">No credit packages are configured.</p>
          )}
        </div>
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Campaigns</h2>
        <div className="mt-5 grid gap-3">
          {adsManager.campaigns.length > 0 ? (
            adsManager.campaigns.map((campaign) => (
              <article className="module-card rounded-md p-5" key={campaign.id}>
                <div className="grid gap-4 md:grid-cols-[160px_minmax(0,1fr)]">
                  {campaign.imageUrl ? (
                    <a className="ad-manager-image" href={campaign.destinationUrl ?? "#"} rel={campaign.destinationUrl && isExternalUrl(campaign.destinationUrl) ? "noreferrer" : undefined} target={campaign.destinationUrl && isExternalUrl(campaign.destinationUrl) ? "_blank" : undefined}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img alt={campaign.title} src={campaign.imageUrl} />
                    </a>
                  ) : (
                    <div className="ad-manager-image is-empty">No image</div>
                  )}
                  <div>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-xl font-semibold">{campaign.title}</h3>
                        <p className="mt-2 leading-6 text-[var(--muted)]">{campaign.body}</p>
                      </div>
                      <span className="pill rounded-full px-3 py-1 text-xs">{campaign.status}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                      <span className="pill rounded-full px-3 py-1">{campaign.destinationKind.toLowerCase().replace("_", " ")}</span>
                      <span className="pill rounded-full px-3 py-1">{campaign.placementLabel}</span>
                      <span className="pill rounded-full px-3 py-1">
                        {campaign.totalBudgetCredits} credits reserved
                      </span>
                      {campaign.endsAt ? <span className="pill rounded-full px-3 py-1">Ends {new Date(campaign.endsAt).toLocaleDateString()}</span> : null}
                      {campaign.targetLocation ? <span className="pill rounded-full px-3 py-1">Location: {campaign.targetLocation}</span> : null}
                      <span className="pill rounded-full px-3 py-1">
                        {campaign.targetInterestLabels.length > 0 ? `Interests: ${campaign.targetInterestLabels.join(", ")}` : "Broad interests"}
                      </span>
                      <span className="pill rounded-full px-3 py-1">
                        {campaign.subscriberTargetLabel ? `Subscribers: ${campaign.subscriberTargetLabel}` : "No subscriber audience"}
                      </span>
                    </div>
                    {campaign.destinationUrl ? (
                      isExternalUrl(campaign.destinationUrl) ? (
                        <a className="mt-4 inline-block text-sm font-semibold text-[var(--gold)] underline" href={campaign.destinationUrl} rel="noreferrer" target="_blank">
                          View destination
                        </a>
                      ) : (
                        <Link className="mt-4 inline-block text-sm font-semibold text-[var(--gold)] underline" href={campaign.destinationUrl}>
                          View destination
                        </Link>
                      )
                    ) : null}
                  </div>
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
