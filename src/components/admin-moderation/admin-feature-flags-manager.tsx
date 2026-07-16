"use client";

import { useMemo, useState, useTransition } from "react";
import type {
  FeatureFlagCategoryDefinition,
  RegisteredFeatureFlagView
} from "@/modules/feature-flags/feature-flags.service";

type PendingChange = {
  scope: "feature" | "category";
  key: string;
  title: string;
  action: "set" | "reset" | "set-category";
  enabled?: boolean;
  effectWhenDisabled: string;
  defaultEnabled?: boolean;
  affectedCount?: number;
};

function statusClass(enabled: boolean) {
  return enabled
    ? "border-emerald-400/45 bg-emerald-950/25 text-emerald-100"
    : "border-red-400/45 bg-red-950/25 text-red-100";
}

function CategorySwitch({ enabled, mixed, onToggle }: { enabled: boolean; mixed: boolean; onToggle: () => void }) {
  return (
    <button
      aria-checked={mixed ? "mixed" : enabled}
      aria-label={`${enabled ? "Disable" : "Enable"} this feature category`}
      className="inline-flex items-center gap-3 rounded-full border border-[var(--line)] px-3 py-2"
      onClick={onToggle}
      role="switch"
      type="button"
    >
      <span className={`relative inline-flex h-7 w-14 shrink-0 rounded-full border transition-colors ${enabled ? "border-emerald-400/60 bg-emerald-700" : mixed ? "border-amber-300/60 bg-amber-800" : "border-red-400/50 bg-red-950"}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-7" : mixed ? "translate-x-4" : "translate-x-1"}`} />
      </span>
      <span className="min-w-14 text-left text-sm font-semibold">{enabled ? "On" : mixed ? "Mixed" : "Off"}</span>
    </button>
  );
}

export function AdminFeatureFlagsManager({
  initialCategories,
  initialFlags
}: {
  initialCategories: readonly FeatureFlagCategoryDefinition[];
  initialFlags: RegisteredFeatureFlagView[];
}) {
  const [flags, setFlags] = useState(initialFlags);
  const [query, setQuery] = useState("");
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const visibleFlags = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return flags;
    return flags.filter((flag) => {
      const category = initialCategories.find((item) => item.key === flag.categoryKey);
      return [
        flag.title,
        flag.key,
        flag.area,
        flag.description,
        flag.effectWhenDisabled,
        flag.enforcement,
        category?.title,
        category?.description
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [flags, initialCategories, query]);

  function proposeFeature(flag: RegisteredFeatureFlagView, action: "set" | "reset", enabled?: boolean) {
    setPendingChange({
      scope: "feature",
      key: flag.key,
      title: flag.title,
      action,
      enabled,
      effectWhenDisabled: flag.effectWhenDisabled,
      defaultEnabled: flag.defaultEnabled
    });
    setReason("");
    setError("");
    setMessage("");
  }

  function proposeCategory(category: FeatureFlagCategoryDefinition, categoryFlags: RegisteredFeatureFlagView[], enabled: boolean) {
    setPendingChange({
      scope: "category",
      key: category.key,
      title: category.title,
      action: "set-category",
      enabled,
      affectedCount: categoryFlags.length,
      effectWhenDisabled: `Every feature in ${category.title} will be disabled together. Existing data is preserved.`
    });
    setReason("");
    setError("");
    setMessage("");
  }

  function save() {
    if (!pendingChange) return;
    setError("");
    startTransition(async () => {
      const response = await fetch("/api/admin/feature-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: pendingChange.action,
          categoryKey: pendingChange.scope === "category" ? pendingChange.key : undefined,
          key: pendingChange.scope === "feature" ? pendingChange.key : undefined,
          enabled: pendingChange.enabled,
          reason
        })
      });
      const payload = (await response.json()) as { error?: string; flags?: RegisteredFeatureFlagView[] };
      if (!response.ok || !payload.flags) {
        setError(payload.error ?? "Could not update the feature control.");
        return;
      }
      setFlags(payload.flags);
      setMessage(
        pendingChange.action === "reset"
          ? `${pendingChange.title} was reset to its documented default.`
          : `${pendingChange.title} is now ${pendingChange.enabled ? "enabled" : "disabled"}${pendingChange.scope === "category" ? " as a group" : ""}.`
      );
      setPendingChange(null);
      setReason("");
    });
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Platform Management</p>
        <h1 className="mt-3 text-3xl font-semibold">Feature Controls</h1>
        <p className="mt-3 max-w-4xl leading-7 text-[var(--muted)]">
          Controls are organized by function. A category switch changes every feature inside that group; individual controls remain available for a mixed configuration. Membership permissions still apply and are never expanded by turning a feature on.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-[var(--line)] p-4"><strong>{initialCategories.length}</strong><span className="mt-1 block text-sm text-[var(--muted)]">Categories</span></div>
          <div className="rounded-md border border-[var(--line)] p-4"><strong>{flags.length}</strong><span className="mt-1 block text-sm text-[var(--muted)]">Registered controls</span></div>
          <div className="rounded-md border border-emerald-400/35 p-4"><strong>{flags.filter((flag) => flag.enabled).length}</strong><span className="mt-1 block text-sm text-[var(--muted)]">Enabled</span></div>
          <div className="rounded-md border border-red-400/35 p-4"><strong>{flags.filter((flag) => !flag.enabled).length}</strong><span className="mt-1 block text-sm text-[var(--muted)]">Disabled</span></div>
        </div>
      </section>

      <section className="surface rounded-md p-5">
        <label className="grid gap-2 text-sm font-semibold" htmlFor="feature-flag-search">
          Find a feature or category
          <input className="form-field" id="feature-flag-search" onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, category, area, or effect..." value={query} />
        </label>
      </section>

      {message ? <p className="rounded-md border border-emerald-400/40 bg-emerald-950/30 p-4 text-sm text-emerald-100">{message}</p> : null}

      <section className="grid gap-5">
        {visibleFlags.length === 0 ? <div className="surface rounded-md p-8 text-center text-[var(--muted)]">No registered feature or category matches that search.</div> : null}
        {initialCategories.map((category) => {
          const displayedCategoryFlags = visibleFlags.filter((flag) => flag.categoryKey === category.key);
          const categoryFlags = flags.filter((flag) => flag.categoryKey === category.key);
          if (displayedCategoryFlags.length === 0) return null;
          const enabledCount = categoryFlags.filter((flag) => flag.enabled).length;
          const allEnabled = enabledCount === categoryFlags.length;
          const mixed = enabledCount > 0 && !allEnabled;
          return (
            <section className="surface overflow-hidden rounded-md" key={category.key}>
              <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] bg-black/10 p-5">
                <div className="max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-semibold text-[var(--gold)]">{category.title}</h2>
                    <span className="pill rounded-full px-3 py-1 text-xs">{enabledCount} of {categoryFlags.length} on</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{category.description}</p>
                </div>
                <CategorySwitch enabled={allEnabled} mixed={mixed} onToggle={() => proposeCategory(category, categoryFlags, !allEnabled)} />
              </header>

              <div className="grid gap-4 p-4 lg:grid-cols-2">
                {displayedCategoryFlags.map((flag) => (
                  <article className="rounded-md border border-[var(--line)] p-5" key={flag.key}>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(flag.enabled)}`}>{flag.enabled ? "Enabled" : "Disabled"}</span>
                          <span className={`rounded-full border px-3 py-1 text-xs ${flag.risk === "high" ? "border-red-400/45 text-red-200" : "border-[var(--line)] text-[var(--muted)]"}`}>{flag.risk} risk</span>
                          <span className="pill rounded-full px-3 py-1 text-xs">{flag.source === "override" ? "Admin override" : "Default"}</span>
                        </div>
                        <h3 className="mt-3 text-xl font-semibold">{flag.title}</h3>
                        <p className="mt-1 break-all font-mono text-xs text-[var(--muted)]">{flag.key}</p>
                      </div>
                      <button aria-pressed={flag.enabled} className={flag.enabled ? "btn-danger" : "btn-primary"} onClick={() => proposeFeature(flag, "set", !flag.enabled)} type="button">
                        {flag.enabled ? "Disable" : "Enable"}
                      </button>
                    </div>
                    <p className="mt-3 leading-7 text-[var(--muted)]">{flag.description}</p>
                    <details className="mt-4 rounded-md border border-[var(--line)] bg-black/10 p-4">
                      <summary className="cursor-pointer font-semibold text-[var(--gold)]">Effects and enforcement</summary>
                      <h4 className="mt-4 font-semibold">If disabled</h4>
                      <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{flag.effectWhenDisabled}</p>
                      <h4 className="mt-4 font-semibold">Where enforced</h4>
                      <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{flag.enforcement}</p>
                    </details>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4 text-sm">
                      <p className="text-[var(--muted)]">Default: <strong className="text-[var(--text)]">{flag.defaultEnabled ? "Enabled" : "Disabled"}</strong>{flag.updatedAt ? ` · Last changed ${new Date(flag.updatedAt).toLocaleString()}` : " · No admin override"}</p>
                      {flag.source === "override" ? <button className="btn-secondary px-4 py-2 text-sm" onClick={() => proposeFeature(flag, "reset")} type="button">Reset</button> : null}
                    </div>
                    {flag.overrideDescription ? <p className="mt-3 rounded-md border border-[var(--line)] p-3 text-sm"><span className="text-[var(--muted)]">Last reason:</span> {flag.overrideDescription}</p> : null}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </section>

      {pendingChange ? (
        <div aria-labelledby="feature-change-title" aria-modal="true" className="conduct-dialog-backdrop" role="dialog">
          <div className="conduct-dialog surface">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">Confirm {pendingChange.scope} change</p>
            <h2 className="mt-2 text-2xl font-semibold" id="feature-change-title">
              {pendingChange.action === "reset" ? `Reset ${pendingChange.title}?` : `${pendingChange.enabled ? "Enable" : "Disable"} ${pendingChange.title}?`}
            </h2>
            <p className="mt-3 leading-7 text-[var(--muted)]">
              {pendingChange.action === "reset"
                ? `This removes the admin override and returns the feature to its documented default: ${pendingChange.defaultEnabled ? "Enabled" : "Disabled"}.`
                : pendingChange.enabled
                  ? `${pendingChange.scope === "category" ? `All ${pendingChange.affectedCount} features in this category` : "This feature"} will become available at the documented entry points on the next request.`
                  : pendingChange.effectWhenDisabled}
            </p>
            {pendingChange.scope === "category" ? <p className="mt-3 rounded-md border border-amber-300/40 bg-amber-950/20 p-3 text-sm">This writes an override to every feature in the category. You can still change an individual feature afterward, which will make the category state Mixed.</p> : null}
            <label className="mt-4 grid gap-2 text-sm font-semibold">
              Required audit reason
              <textarea className="form-field min-h-28 resize-y" maxLength={1000} onChange={(event) => setReason(event.target.value)} placeholder="Why is this operational change being made?" value={reason} />
            </label>
            {error ? <p className="mt-4 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button className="btn-secondary" disabled={isPending} onClick={() => setPendingChange(null)} type="button">Cancel</button>
              <button className={pendingChange.action !== "reset" && pendingChange.enabled === false ? "btn-danger" : "btn-primary"} disabled={isPending || reason.trim().length < 10} onClick={save} type="button">
                {isPending ? "Saving..." : "Confirm change"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
