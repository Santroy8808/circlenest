import type { TierPolicy } from "@/modules/membership-policy/policy";

const featuredRows = [
  { key: "groups.create", label: "Create groups" },
  { key: "groups.assignModerators", label: "Assign group moderators" },
  { key: "events.create", label: "Create events" },
  { key: "market.createListing", label: "Create Market listings" },
  { key: "jobs.createListing", label: "Create job listings" },
  { key: "auditors.createProfile", label: "Create auditor profile" },
  { key: "ads.createGeneral", label: "Create general ads" },
  { key: "fundraisers.create", label: "Create fundraisers" },
  { key: "writers.access", label: "Writers Corner" }
] as const;

function booleanLabel(value: boolean) {
  return value ? "Yes" : "No";
}

function limitLabel(value: number | null, suffix: string) {
  return value === null ? "Unlimited" : `${value}${suffix}`;
}

export function MembershipMatrix({ policies }: { policies: TierPolicy[] }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-4">
        {policies.map((policy) => (
          <article key={policy.tier} className="module-card rounded-md p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">{policy.tier}</p>
            <h2 className="mt-2 text-xl font-semibold">{policy.displayName}</h2>
            <p className="mt-3 min-h-20 text-sm leading-6 text-[var(--muted)]">{policy.summary}</p>
            <div className="mt-4 grid gap-2 text-sm text-[var(--muted)]">
              <p>Group cap: {policy.limits.groupMemberCap ?? "Unlimited"}</p>
              <p>Market listings: {limitLabel(policy.limits.marketListingsPer14Days, " / 14 days")}</p>
              <p>Fundraisers: {limitLabel(policy.limits.fundraiserPerMonth, " / month")}</p>
            </div>
          </article>
        ))}
      </div>

      <section className="surface overflow-hidden rounded-md">
        <div className="grid min-w-[760px] grid-cols-[240px_repeat(4,1fr)] border-b border-[var(--line)] bg-black/20">
          <div className="p-3 font-semibold text-[var(--gold)]">Feature</div>
          {policies.map((policy) => (
            <div key={policy.tier} className="p-3 font-semibold">
              {policy.displayName}
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          {featuredRows.map((row) => (
            <div key={row.key} className="grid min-w-[760px] grid-cols-[240px_repeat(4,1fr)] border-b border-[var(--line)] last:border-b-0">
              <div className="p-3 text-sm text-[var(--muted)]">{row.label}</div>
              {policies.map((policy) => (
                <div key={`${policy.tier}-${row.key}`} className="p-3 text-sm">
                  {booleanLabel(policy.features[row.key])}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
