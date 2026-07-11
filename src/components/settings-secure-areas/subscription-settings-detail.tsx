import { getTierPolicy } from "@/modules/membership-policy/policy";
import { BillingPortalButton } from "@/components/settings-secure-areas/billing-portal-button";
import { SubscriptionCheckoutButton } from "@/components/settings-secure-areas/subscription-checkout-button";
import type { EffectivePolicy } from "@/modules/membership-policy/membership-policy.service";
import type {
  SubscriptionBillingSummary,
  SubscriptionUpgradePlanView
} from "@/modules/membership-policy/subscriptions.service";

type Plan = SubscriptionUpgradePlanView;

function money(cents: number | null | undefined) {
  if (cents == null) return "Not set";
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(cents / 100);
}

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
  plans,
  policy,
  portalStatus
}: {
  billing: SubscriptionBillingSummary;
  checkoutStatus?: string;
  plans: Plan[];
  policy: EffectivePolicy;
  portalStatus?: string;
}) {
  const currentPolicy = getTierPolicy(policy.actualTier);

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
      <section className="rounded-md border border-[var(--line)] bg-black/10 p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Current membership</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-[var(--line)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Your plan</p>
            <p className="mt-2 text-xl font-semibold">{currentPolicy.displayName}</p>
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

      <section className="rounded-md border border-[var(--line)] bg-black/10 p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Available upgrades</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Choose a plan to continue to secure checkout. You can review the price before paying.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {plans.map((plan) => (
            <article className="module-card rounded-md p-4" key={plan.tier}>
              <h3 className="text-lg font-semibold">{plan.displayName}</h3>
              <p className="mt-2 text-sm text-[var(--muted)]">Monthly price: {money(plan.standardPriceCents)}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{plan.summary}</p>
              <p className="text-sm text-[var(--muted)]">Monthly credits: {plan.monthlyCreditBudget.toLocaleString()}</p>
              {plan.hiddenUntilEligible ? <p className="mt-2 text-sm text-[var(--gold)]">This plan requires approval.</p> : null}
              {!plan.checkoutReady ? <p className="mt-3 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">Checkout is temporarily unavailable for this plan.</p> : null}
              <div className="mt-4">
                {plan.current ? (
                  <span className="pill rounded-full px-3 py-1 text-sm">Current plan</span>
                ) : (
                  <SubscriptionCheckoutButton disabled={!plan.checkoutReady} planName={plan.displayName} tier={plan.tier} />
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
