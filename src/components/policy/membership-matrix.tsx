import type { TierPolicy } from "@/modules/membership-policy/policy";

const availableFeatureRows = [
  { key: "feed.changeType", label: "Additional Stream post types" },
  { key: "groups.create", label: "Create groups" },
  { key: "groups.assignModerators", label: "Assign group moderators" },
  { key: "groups.unlimitedSize", label: "Unlimited group size" },
  { key: "events.create", label: "Create events" },
  { key: "market.createListing", label: "Create Market listings" },
  { key: "market.createAd", label: "Promote Market listings" },
  { key: "market.storefront", label: "Business storefront" },
  { key: "jobs.browse", label: "Browse jobs" },
  { key: "jobs.createListing", label: "Create job listings" },
  { key: "auditors.browse", label: "Browse the Auditor Directory" },
  { key: "auditors.createProfile", label: "Create an auditor profile" },
  { key: "ads.createGeneral", label: "Create general ads" },
  { key: "ads.createFundraiser", label: "Create fundraiser ads" },
  { key: "writers.access", label: "Writers Corner" },
  { key: "fundraisers.create", label: "Create fundraisers" },
  { key: "invites.send", label: "Create membership invites" },
  { key: "support.createRequest", label: "Create support requests" },
  { key: "mail.massSend", label: "Send internal mass mail" },
  { key: "mail.orgMassSend", label: "Send Org mass mail" },
  { key: "org.profile", label: "Org profile" }
] as const;

function limitLabel(value: number | null, suffix: string) {
  return value === null ? "Unlimited" : `${value}${suffix}`;
}

function storageLabel(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${bytes / (1024 * 1024 * 1024)} GB`;
  return `${bytes / (1024 * 1024)} MB`;
}

function marketLimitLabel(policy: TierPolicy) {
  if (policy.limits.marketActiveListingCap !== null) {
    return `${policy.limits.marketActiveListingCap} active at a time`;
  }
  return limitLabel(policy.limits.marketListingsPer14Days, " / 14 days");
}

export function MembershipMatrix({ policies }: { policies: TierPolicy[] }) {
  const policy = policies[0];
  if (!policy) return null;
  const enabledFeatures = availableFeatureRows.filter((row) => policy.features[row.key]);

  return (
    <div className="grid gap-4">
      <article className="module-card rounded-md p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Current membership</p>
        <h2 className="mt-2 text-2xl font-semibold">{policy.displayName}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">{policy.summary}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-[var(--line)] p-3">Group cap: {policy.limits.groupMemberCap ?? "Unlimited"}</div>
          <div className="rounded-md border border-[var(--line)] p-3">Market listings: {marketLimitLabel(policy)}</div>
          <div className="rounded-md border border-[var(--line)] p-3">Photos per listing: {policy.limits.marketListingPhotoCap ?? "Unlimited"}</div>
          <div className="rounded-md border border-[var(--line)] p-3">Storage: {storageLabel(policy.limits.storageLimitBytes)}</div>
        </div>
      </article>

      <section className="surface rounded-md p-5">
        <h2 className="text-xl font-semibold text-[var(--gold)]">Available now</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {enabledFeatures.map((row) => (
            <li className="rounded-md border border-[var(--line)] p-3" key={row.key}>{row.label}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
