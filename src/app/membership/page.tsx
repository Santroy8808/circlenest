import { AppShell } from "@/components/platform/app-shell";
import { MembershipMatrix } from "@/components/policy/membership-matrix";
import { listSubscriptionPlanRules } from "@/modules/membership-policy/launch-access.service";
import { getEffectivePublicPolicyMatrix } from "@/modules/membership-policy/membership-policy.service";

export const dynamic = "force-dynamic";

export default async function MembershipPage() {
  const policies = await getEffectivePublicPolicyMatrix();
  const publicTiers = new Set(policies.map((policy) => policy.tier));
  const plans = (await listSubscriptionPlanRules()).filter((plan) => publicTiers.has(plan.tier));

  return (
    <AppShell>
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Membership</p>
        <h1 className="mt-3 text-3xl font-semibold">Choose the access that fits you</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
          Every invited member can use Theta-Space&apos;s core community features. Paid plans add higher limits and advanced tools.
        </p>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
          Compare the plans below. If early-member pricing is available, it will be shown before checkout.
        </p>
      </section>
      <section className="mt-5">
        <MembershipMatrix plans={plans} policies={policies} />
      </section>
    </AppShell>
  );
}
