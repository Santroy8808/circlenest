"use client";

import { MembershipTier, StripeIntegrationMode } from "@prisma/client";
import { useState, useTransition } from "react";
import type { StripeSetupAdminView } from "@/modules/billing/stripe-admin.service";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(cents / 100);
}

function statusLabel(configured: boolean, source: string) {
  if (!configured) return "missing";
  return source === "env" ? "Railway env" : "admin saved";
}

export function AdminStripeSetupWizard({ initialView }: { initialView: StripeSetupAdminView }) {
  const [view, setView] = useState(initialView);
  const [message, setMessage] = useState("");
  const [connection, setConnection] = useState({
    mode: view.connection.mode,
    publishableKey: "",
    secretKey: "",
    webhookSecret: "",
    currency: view.connection.currency,
    subscriptionCheckoutEnabled: view.connection.subscriptionCheckoutEnabled,
    creditCheckoutEnabled: view.connection.creditCheckoutEnabled,
    clearPublishableKey: false,
    clearSecretKey: false,
    clearWebhookSecret: false
  });
  const [subscriptionPriceIds, setSubscriptionPriceIds] = useState<Record<string, string>>(
    Object.fromEntries(view.subscriptionPlans.map((plan) => [plan.tier, plan.stripePriceId ?? ""]))
  );
  const [creditPackages, setCreditPackages] = useState(
    view.creditPackages.map((creditPackage) => ({
      ...creditPackage,
      description: creditPackage.description ?? "",
      stripePriceId: creditPackage.stripePriceId ?? ""
    }))
  );
  const [newPackage, setNewPackage] = useState({
    key: "credits.custom",
    label: "Custom credit pack",
    description: "",
    creditAmount: 50,
    priceCents: 1000,
    stripePriceId: "",
    active: true,
    sortOrder: 100
  });
  const [isPending, startTransition] = useTransition();

  function applyView(nextView: StripeSetupAdminView) {
    setView(nextView);
    setConnection((current) => ({
      ...current,
      mode: nextView.connection.mode,
      currency: nextView.connection.currency,
      subscriptionCheckoutEnabled: nextView.connection.subscriptionCheckoutEnabled,
      creditCheckoutEnabled: nextView.connection.creditCheckoutEnabled,
      publishableKey: "",
      secretKey: "",
      webhookSecret: "",
      clearPublishableKey: false,
      clearSecretKey: false,
      clearWebhookSecret: false
    }));
    setSubscriptionPriceIds(Object.fromEntries(nextView.subscriptionPlans.map((plan) => [plan.tier, plan.stripePriceId ?? ""])));
    setCreditPackages(
      nextView.creditPackages.map((creditPackage) => ({
        ...creditPackage,
        description: creditPackage.description ?? "",
        stripePriceId: creditPackage.stripePriceId ?? ""
      }))
    );
  }

  function save(action: string, payload: unknown, successMessage: string) {
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/admin/stripe-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload })
      });
      const responsePayload = (await response.json().catch(() => null)) as { error?: string; view?: StripeSetupAdminView } | null;

      if (!response.ok || !responsePayload?.view) {
        setMessage(responsePayload?.error ?? "Could not save Stripe setup.");
        return;
      }

      applyView(responsePayload.view);
      setMessage(successMessage);
    });
  }

  function updateCreditPackage(index: number, patch: Partial<(typeof creditPackages)[number]>) {
    setCreditPackages((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Stripe Setup</p>
        <h1 className="mt-3 text-3xl font-semibold">Billing connection</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
          Configure the bridge between Theta-Space and Stripe. Checkout starts here; subscriptions and credit grants still complete only after verified Stripe webhooks.
        </p>
        {message ? <p className="mt-4 rounded-md border border-[var(--line)] bg-black/20 p-3 text-sm text-[var(--gold)]">{message}</p> : null}
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">1. Connection checklist</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="module-card rounded-md p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Secret key</p>
            <p className="mt-2 font-semibold">{statusLabel(view.connection.secretKeyConfigured, view.connection.secretKeySource)}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{view.connection.secretKeyPreview ?? "No key available"}</p>
          </div>
          <div className="module-card rounded-md p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Webhook secret</p>
            <p className="mt-2 font-semibold">{statusLabel(view.connection.webhookSecretConfigured, view.connection.webhookSecretSource)}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{view.connection.webhookSecretPreview ?? "No webhook secret available"}</p>
          </div>
          <div className="module-card rounded-md p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Webhook endpoint</p>
            <p className="mt-2 break-all text-sm text-[var(--muted)]">{view.connection.webhookEndpoint}</p>
          </div>
        </div>
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">2. Save Stripe connection</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="form-label">Mode</span>
            <select className="form-field" onChange={(event) => setConnection((current) => ({ ...current, mode: event.target.value as StripeIntegrationMode }))} value={connection.mode}>
              <option value={StripeIntegrationMode.TEST}>Test</option>
              <option value={StripeIntegrationMode.LIVE}>Live</option>
            </select>
          </label>
          <label className="grid gap-2">
            <span className="form-label">Currency</span>
            <input className="form-field" onChange={(event) => setConnection((current) => ({ ...current, currency: event.target.value }))} value={connection.currency} />
          </label>
          <label className="grid gap-2 md:col-span-2">
            <span className="form-label">Publishable key</span>
            <input className="form-field" onChange={(event) => setConnection((current) => ({ ...current, publishableKey: event.target.value }))} placeholder="pk_test_..." value={connection.publishableKey} />
          </label>
          <label className="grid gap-2">
            <span className="form-label">Secret key</span>
            <input className="form-field" onChange={(event) => setConnection((current) => ({ ...current, secretKey: event.target.value }))} placeholder="sk_test_..." type="password" value={connection.secretKey} />
          </label>
          <label className="grid gap-2">
            <span className="form-label">Webhook signing secret</span>
            <input className="form-field" onChange={(event) => setConnection((current) => ({ ...current, webhookSecret: event.target.value }))} placeholder="whsec_..." type="password" value={connection.webhookSecret} />
          </label>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <input checked={connection.subscriptionCheckoutEnabled} onChange={(event) => setConnection((current) => ({ ...current, subscriptionCheckoutEnabled: event.target.checked }))} type="checkbox" />
            Enable subscription checkout
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <input checked={connection.creditCheckoutEnabled} onChange={(event) => setConnection((current) => ({ ...current, creditCheckoutEnabled: event.target.checked }))} type="checkbox" />
            Enable credit checkout
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <input checked={connection.clearPublishableKey} onChange={(event) => setConnection((current) => ({ ...current, clearPublishableKey: event.target.checked }))} type="checkbox" />
            Clear saved publishable key
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <input checked={connection.clearSecretKey} onChange={(event) => setConnection((current) => ({ ...current, clearSecretKey: event.target.checked }))} type="checkbox" />
            Clear saved secret key
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <input checked={connection.clearWebhookSecret} onChange={(event) => setConnection((current) => ({ ...current, clearWebhookSecret: event.target.checked }))} type="checkbox" />
            Clear saved webhook secret
          </label>
        </div>
        <button className="btn-primary mt-5" disabled={isPending} onClick={() => save("connection", connection, "Stripe connection saved.")} type="button">
          {isPending ? "Saving..." : "Save connection"}
        </button>
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">3. Membership Stripe price IDs</h2>
        <div className="mt-4 grid gap-3">
          {view.subscriptionPlans
            .filter((plan) => plan.tier !== MembershipTier.FREE)
            .map((plan) => (
              <article className="module-card rounded-md p-4" key={plan.tier}>
                <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-end">
                  <div>
                    <p className="font-semibold">{plan.displayName}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">{money(plan.standardPriceCents)} / month</p>
                  </div>
                  <label className="grid gap-2">
                    <span className="form-label">Stripe recurring price ID</span>
                    <input className="form-field" onChange={(event) => setSubscriptionPriceIds((current) => ({ ...current, [plan.tier]: event.target.value }))} placeholder="price_..." value={subscriptionPriceIds[plan.tier] ?? ""} />
                  </label>
                  <button className="btn-secondary" disabled={isPending} onClick={() => save("subscription-price", { tier: plan.tier, stripePriceId: subscriptionPriceIds[plan.tier] ?? "" }, `${plan.displayName} Stripe price saved.`)} type="button">
                    Save
                  </button>
                </div>
              </article>
            ))}
        </div>
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">4. Advertising credit packages</h2>
        <div className="mt-4 grid gap-3">
          {creditPackages.map((creditPackage, index) => (
            <article className="module-card rounded-md p-4" key={creditPackage.key}>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="form-label">Key</span>
                  <input className="form-field" onChange={(event) => updateCreditPackage(index, { key: event.target.value })} value={creditPackage.key} />
                </label>
                <label className="grid gap-2">
                  <span className="form-label">Label</span>
                  <input className="form-field" onChange={(event) => updateCreditPackage(index, { label: event.target.value })} value={creditPackage.label} />
                </label>
                <label className="grid gap-2">
                  <span className="form-label">Credits</span>
                  <input className="form-field" onChange={(event) => updateCreditPackage(index, { creditAmount: Number(event.target.value) })} type="number" value={creditPackage.creditAmount} />
                </label>
                <label className="grid gap-2">
                  <span className="form-label">Display price cents</span>
                  <input className="form-field" onChange={(event) => updateCreditPackage(index, { priceCents: Number(event.target.value) })} type="number" value={creditPackage.priceCents} />
                </label>
                <label className="grid gap-2 md:col-span-2">
                  <span className="form-label">Stripe one-time price ID</span>
                  <input className="form-field" onChange={(event) => updateCreditPackage(index, { stripePriceId: event.target.value })} placeholder="price_..." value={creditPackage.stripePriceId} />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                  <input checked={creditPackage.active} onChange={(event) => updateCreditPackage(index, { active: event.target.checked })} type="checkbox" />
                  Active
                </label>
                <button className="btn-secondary" disabled={isPending} onClick={() => save("credit-package", creditPackage, `${creditPackage.label} saved.`)} type="button">
                  Save package
                </button>
              </div>
            </article>
          ))}
          <article className="module-card rounded-md p-4">
            <h3 className="text-lg font-semibold">Add package</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <input className="form-field" onChange={(event) => setNewPackage((current) => ({ ...current, key: event.target.value }))} placeholder="credits.custom.100" value={newPackage.key} />
              <input className="form-field" onChange={(event) => setNewPackage((current) => ({ ...current, label: event.target.value }))} placeholder="Package label" value={newPackage.label} />
              <input className="form-field" onChange={(event) => setNewPackage((current) => ({ ...current, creditAmount: Number(event.target.value) }))} placeholder="Credits" type="number" value={newPackage.creditAmount} />
              <input className="form-field" onChange={(event) => setNewPackage((current) => ({ ...current, priceCents: Number(event.target.value) }))} placeholder="Price cents" type="number" value={newPackage.priceCents} />
              <input className="form-field md:col-span-2" onChange={(event) => setNewPackage((current) => ({ ...current, stripePriceId: event.target.value }))} placeholder="Stripe one-time price ID" value={newPackage.stripePriceId} />
            </div>
            <button className="btn-primary mt-4" disabled={isPending} onClick={() => save("credit-package", newPackage, "Credit package added.")} type="button">
              Add package
            </button>
          </article>
        </div>
      </section>
    </div>
  );
}
