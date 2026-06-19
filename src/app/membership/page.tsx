import { AppShell } from "@/components/platform/app-shell";
import { MembershipMatrix } from "@/components/policy/membership-matrix";
import { listSubscriptionPlanRules } from "@/modules/membership-policy/launch-access.service";
import { getPolicyMatrix } from "@/modules/membership-policy/membership-policy.service";

export const dynamic = "force-dynamic";

export default async function MembershipPage() {
  const policies = getPolicyMatrix();
  const plans = await listSubscriptionPlanRules();

  return (
    <AppShell>
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Membership Policy</p>
        <h1 className="mt-3 text-3xl font-semibold">Tier matrix</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
          This central matrix is the source of truth for Free, Contributor, Professional, and Auditor capabilities.
          Admin remains a separate role, not a paid tier.
        </p>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
          Launch access can temporarily expand Free-tier capabilities, while founder pricing rewards the first wave of Contributor and Professional members.
        </p>
      </section>
      <section className="mt-5">
        <MembershipMatrix plans={plans} policies={policies} />
      </section>
    </AppShell>
  );
}
