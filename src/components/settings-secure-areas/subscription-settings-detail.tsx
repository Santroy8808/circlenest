import { BillingPortalButton } from "@/components/settings-secure-areas/billing-portal-button";
import { ContributorBetaUpgradeCard } from "@/components/settings-secure-areas/contributor-beta-upgrade-card";
import type { EffectivePolicy } from "@/modules/membership-policy/membership-policy.service";
import type { SubscriptionBillingSummary } from "@/modules/membership-policy/subscriptions.service";
import { visibleContributorUpgradeOffer } from "@/modules/membership-policy/subscription-view";

function bytes(value: number) {
  if (value >= 1024 * 1024 * 1024) return `${Math.round(value / 1024 / 1024 / 1024)} GB`;
  return `${Math.round(value / 1024 / 1024)} MB`;
}

function statusLabel(status: SubscriptionBillingSummary["subscriptionStatus"]) {
  if (status === "ACTIVE") return "Active";
  if (status === "TRIALING") return "Trialing";
  if (status === "PAST_DUE") return "Past due";
  if (status === "CANCELED") return "Canceled";
  if (status === "UNPAID") return "Unpaid";
  if (status === "INCOMPLETE") return "Incomplete";
  return "None";
}

function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "Not set";
}

export function SubscriptionSettingsDetail({
  billing,
  checkoutStatus,
  policy,
  portalStatus
}: {
  billing: SubscriptionBillingSummary;
  checkoutStatus?: string;
  policy: EffectivePolicy;
  portalStatus?: string;
}) {
  const contributorOffer = visibleContributorUpgradeOffer({
    currentTier: policy.tier,
    offer: policy.contributorOffer
  });

  return (
    <div className="grid gap-5">
      {checkoutStatus === "success" ? (
        <p className="rounded-md border border-emerald-400/40 bg-emerald-950/30 p-3 text-sm text-emerald-100">
          Checkout completed. Stripe is syncing your subscription status.
        </p>
      ) : null}
      {checkoutStatus === "cancel" ? (
        <p className="rounded-md border border-[var(--line)] bg-black/20 p-3 text-sm text-[var(--muted)]">
          Checkout was canceled. No subscription changes were made.
        </p>
      ) : null}
      {portalStatus === "return" ? (
        <p className="rounded-md border border-[var(--line)] bg-black/20 p-3 text-sm text-[var(--muted)]">
          Billing management closed. Stripe updates may take a moment to appear.
        </p>
      ) : null}
      {contributorOffer ? <ContributorBetaUpgradeCard offer={contributorOffer} /> : null}
      <section className="rounded-md border border-[var(--line)] bg-black/10 p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Current membership</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-[var(--line)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Your plan</p>
            <p className="mt-2 text-xl font-semibold">{policy.displayName}</p>
          </div>
          <div className="rounded-md border border-[var(--line)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Access available now</p>
            <p className="mt-2 text-xl font-semibold">{policy.displayName}</p>
          </div>
          <div className="rounded-md border border-[var(--line)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">File storage</p>
            <p className="mt-2 text-xl font-semibold">{bytes(policy.limits.storageLimitBytes)}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-[var(--line)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Stripe status</p>
            <p className="mt-2 text-xl font-semibold">{statusLabel(billing.subscriptionStatus)}</p>
          </div>
          <div className="rounded-md border border-[var(--line)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Billing period</p>
            <p className="mt-2 text-xl font-semibold">{dateLabel(billing.subscriptionCurrentPeriodEnd)}</p>
          </div>
          <div className="rounded-md border border-[var(--line)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Renewal</p>
            <p className="mt-2 text-xl font-semibold">
              {billing.subscriptionCancelAtPeriodEnd ? "Cancels at period end" : billing.stripeSubscriptionId ? "Renews automatically" : "Not subscribed"}
            </p>
          </div>
        </div>
        {billing.canManageBilling ? (
          <div className="mt-4 max-w-sm">
            <BillingPortalButton />
          </div>
        ) : null}
        {policy.promotionalAccess ? (
          <p className="mt-4 rounded-md border border-[var(--line)] bg-black/20 p-3 text-sm text-[var(--muted)]">
            Promotional access: {policy.promotionalAccess.label} through {new Date(policy.promotionalAccess.expiresAt).toLocaleDateString()}.
          </p>
        ) : null}
      </section>
    </div>
  );
}
