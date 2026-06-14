"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PaymentProcessorConfigSummary } from "@/lib/payments/processor-config";

type PaymentProcessorConsoleProps = {
  configs: PaymentProcessorConfigSummary[];
};

const FIELD_CLASS =
  "w-full rounded-lg border border-[#52647f] bg-[#253145] px-3 py-2 font-sans text-sm leading-5 text-[#f3f6fb] shadow-inner shadow-black/10 placeholder:text-slate-400 focus:border-amber-300/60 focus:outline-none focus:ring-2 focus:ring-amber-300/25";

export function PaymentProcessorConsole({ configs }: PaymentProcessorConsoleProps) {
  const router = useRouter();
  const [provider, setProvider] = useState("STRIPE");
  const [area, setArea] = useState("MEMBERSHIP_SUBSCRIPTIONS");
  const [mode, setMode] = useState("SANDBOX");
  const [displayName, setDisplayName] = useState("Stripe membership subscriptions");
  const [publicKeyLabel, setPublicKeyLabel] = useState("STRIPE_PUBLISHABLE_KEY");
  const [secretEnvVarName, setSecretEnvVarName] = useState("STRIPE_SECRET_KEY");
  const [webhookSecretEnvVarName, setWebhookSecretEnvVarName] = useState("STRIPE_WEBHOOK_SECRET");
  const [platformFeeBps, setPlatformFeeBps] = useState("0");
  const [enabledFlows, setEnabledFlows] = useState("MEMBERSHIP_SUBSCRIPTIONS");
  const [withdrawalBatchSchedule, setWithdrawalBatchSchedule] = useState("TUESDAY, THURSDAY, SATURDAY");
  const [isEnabled, setIsEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveConfig() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/processors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          area,
          mode,
          displayName,
          publicKeyLabel,
          secretEnvVarName,
          webhookSecretEnvVarName,
          platformFeeBps: Number.parseInt(platformFeeBps || "0", 10),
          enabledFlows: enabledFlows.split(",").map((flow) => flow.trim()).filter(Boolean),
          withdrawalBatchSchedule: withdrawalBatchSchedule.split(",").map((day) => day.trim()).filter(Boolean),
          isEnabled,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage(payload.error ?? "Could not save processor config.");
        return;
      }
      setMessage("Processor config saved. Secret values were not stored or displayed.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">
        Secret keys are not shown or saved here. Use Railway/Neon/hosted environment variables for real secret values.
      </div>

      <section className="rounded border border-[var(--border)] bg-[#101a2c] p-4">
        <h2 className="text-lg font-semibold text-[var(--text-strong)]">Configure processor metadata</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-sm">
            <span className="text-slate-300">Provider</span>
            <select value={provider} onChange={(event) => setProvider(event.target.value)} className={FIELD_CLASS}>
              <option value="STRIPE">Stripe</option>
              <option value="MANUAL_REVIEW">Manual review</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-300">Area</span>
            <select value={area} onChange={(event) => setArea(event.target.value)} className={FIELD_CLASS}>
              <option value="MEMBERSHIP_SUBSCRIPTIONS">Membership subscriptions</option>
              <option value="MARKETPLACE_PAYMENTS">Marketplace payments</option>
              <option value="FUNDRAISER_DONATIONS">Fundraiser donations</option>
              <option value="EVENT_PAYMENTS">Event payments</option>
              <option value="BUSINESS_ONBOARDING">Business onboarding</option>
              <option value="WITHDRAWALS_PAYOUTS">Withdrawals and payouts</option>
              <option value="PLATFORM_FEES">Platform fees</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-300">Mode</span>
            <select value={mode} onChange={(event) => setMode(event.target.value)} className={FIELD_CLASS}>
              <option value="SANDBOX">Sandbox</option>
              <option value="PRODUCTION">Production</option>
            </select>
          </label>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-slate-300">Display name</span>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className={FIELD_CLASS} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-300">Public key label</span>
            <input value={publicKeyLabel} onChange={(event) => setPublicKeyLabel(event.target.value)} className={FIELD_CLASS} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-300">Secret env var name</span>
            <input value={secretEnvVarName} onChange={(event) => setSecretEnvVarName(event.target.value)} className={FIELD_CLASS} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-300">Webhook secret env var name</span>
            <input value={webhookSecretEnvVarName} onChange={(event) => setWebhookSecretEnvVarName(event.target.value)} className={FIELD_CLASS} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-300">Enabled flows, comma-separated</span>
            <input value={enabledFlows} onChange={(event) => setEnabledFlows(event.target.value)} className={FIELD_CLASS} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-300">Withdrawal batch schedule</span>
            <input value={withdrawalBatchSchedule} onChange={(event) => setWithdrawalBatchSchedule(event.target.value)} className={FIELD_CLASS} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-300">Platform fee bps</span>
            <input value={platformFeeBps} onChange={(event) => setPlatformFeeBps(event.target.value)} className={FIELD_CLASS} inputMode="numeric" />
          </label>
          <label className="flex items-center gap-2 pt-6 text-sm text-slate-200">
            <input type="checkbox" checked={isEnabled} onChange={(event) => setIsEnabled(event.target.checked)} />
            Enabled for selected flow
          </label>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void saveConfig()}
          className="mt-4 rounded-full bg-[#3668ff] px-5 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#5781ff] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save processor config"}
        </button>
        {message ? <p className="mt-3 text-sm text-slate-300">{message}</p> : null}
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold text-[var(--text-strong)]">Configured processors</h2>
        {configs.map((config) => (
          <article key={config.id} className="rounded border border-[var(--border)] bg-[#101a2c] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-[var(--text-strong)]">{config.displayName}</p>
                <p className="text-xs uppercase tracking-[0.16em] text-[#f0d878]">
                  {config.provider} - {config.area.replaceAll("_", " ")} - {config.mode}
                </p>
              </div>
              <span className="rounded-full border border-[#52647f] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">
                {config.isEnabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <div className="mt-3 grid gap-2 text-sm text-slate-300 md:grid-cols-4">
              <p>Secret: {config.secretConfigured ? "Configured" : "Missing"}</p>
              <p>Webhook secret: {config.webhookSecretConfigured ? "Configured" : "Missing"}</p>
              <p>Webhook: {config.webhookHealthStatus}</p>
              <p>Fee: {(config.platformFeeBps / 100).toFixed(2)}%</p>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Env refs: {config.secretEnvVarName ?? "none"} / {config.webhookSecretEnvVarName ?? "none"}
            </p>
            {config.recentWebhookEvents.length ? (
              <div className="mt-3 space-y-1">
                {config.recentWebhookEvents.map((event) => (
                  <p key={event.id} className="text-xs text-slate-400">
                    {event.eventType} - {event.status} - {new Date(event.receivedAt).toLocaleString()}
                  </p>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}
