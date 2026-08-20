import type { BillingInvoice } from "@prisma/client";
import { BillingPortalButton } from "@/components/settings-secure-areas/billing-portal-button";
import { ContributorBetaUpgradeCard } from "@/components/settings-secure-areas/contributor-beta-upgrade-card";
import { SubscriptionCheckoutButton } from "@/components/settings-secure-areas/subscription-checkout-button";
import { MembershipStorageArchivePanel, type MembershipStorageArchivePanelView } from "@/components/settings-secure-areas/membership-storage-archive-panel";
import type { EffectivePolicy } from "@/modules/membership-policy/membership-policy.service";
import type {
  SubscriptionBillingSummary,
  SubscriptionUpgradePlanView
} from "@/modules/membership-policy/subscriptions.service";
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

function invoiceMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function SubscriptionSettingsDetail({
  billing,
  checkoutStatus,
  invoices,
  plans,
  policy,
  portalStatus,
  storageArchive
}: {
  billing: SubscriptionBillingSummary;
  checkoutStatus?: string;
  invoices: BillingInvoice[];
  plans: SubscriptionUpgradePlanView[];
  policy: EffectivePolicy;
  portalStatus?: string;
  storageArchive: MembershipStorageArchivePanelView | null;
}) {
  const contributorOffer = visibleContributorUpgradeOffer({
    currentTier: policy.tier,
    offer: policy.contributorOffer
  });
  const paidContributorPlan = plans.find((plan) => plan.upgradeMode === "STRIPE" && !plan.current) ?? null;

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
      {paidContributorPlan ? (
        <section className="rounded-md border border-[var(--gold)] bg-[var(--panel-soft)] p-5" aria-labelledby="paid-contributor-heading">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">Contributor membership</p>
          <h2 className="mt-2 text-2xl font-semibold" id="paid-contributor-heading">Upgrade to Contributor</h2>
          <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">{paidContributorPlan.summary}</p>
          <p className="mt-3 text-xl font-semibold text-[var(--gold)]">
            {invoiceMoney(paidContributorPlan.standardPriceCents, "USD")} per month
          </p>
          <div className="mt-5 max-w-sm">
            <SubscriptionCheckoutButton
              disabled={!paidContributorPlan.checkoutReady}
              planName={paidContributorPlan.displayName}
              tier={paidContributorPlan.tier}
            />
          </div>
          {!paidContributorPlan.checkoutReady ? (
            <p className="mt-3 text-sm text-[var(--muted)]">Payment checkout is being configured. No charge can be started yet.</p>
          ) : null}
        </section>
      ) : contributorOffer ? <ContributorBetaUpgradeCard offer={contributorOffer} /> : null}
      <MembershipStorageArchivePanel archive={storageArchive} />
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
      <section className="rounded-md border border-[var(--line)] bg-black/10 p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Invoices</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Subscription invoices and payment receipts associated with this account.</p>
        {invoices.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-[var(--line)] p-4 text-sm text-[var(--muted)]">No invoices yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="text-xs uppercase text-[var(--gold)]">
                <tr><th className="p-3">Invoice</th><th className="p-3">Date</th><th className="p-3">Status</th><th className="p-3">Amount</th><th className="p-3">Mode</th><th className="p-3">Document</th></tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr className="border-t border-[var(--line)]" key={invoice.id}>
                    <td className="p-3 font-semibold">{invoice.invoiceNumber ?? invoice.stripeInvoiceId}</td>
                    <td className="p-3">{invoice.stripeCreatedAt.toLocaleDateString()}</td>
                    <td className="p-3">{invoice.status}</td>
                    <td className="p-3">{invoiceMoney(invoice.totalCents, invoice.currency)}</td>
                    <td className="p-3">{invoice.livemode ? "Live" : "Test"}</td>
                    <td className="p-3">
                      {invoice.hostedInvoiceUrl || invoice.invoicePdfUrl ? (
                        <a className="text-[var(--gold)] underline" href={invoice.hostedInvoiceUrl ?? invoice.invoicePdfUrl ?? "#"} rel="noreferrer" target="_blank">View invoice</a>
                      ) : "Pending"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
