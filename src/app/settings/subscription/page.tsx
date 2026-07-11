import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { SecureSettingsPanel } from "@/components/settings-secure-areas/secure-settings-panel";
import { SubscriptionSettingsDetail } from "@/components/settings-secure-areas/subscription-settings-detail";
import { getEffectivePolicyForUser } from "@/modules/membership-policy/membership-policy.service";
import {
  getSubscriptionBillingSummary,
  listAvailableSubscriptionUpgradePlans
} from "@/modules/membership-policy/subscriptions.service";

export default async function SubscriptionSettingsPage({
  searchParams
}: {
  searchParams?: { checkout?: string; portal?: string };
}) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/settings/subscription");
  }

  const [policy, plans, billing] = await Promise.all([
    getEffectivePolicyForUser(session.user.id),
    listAvailableSubscriptionUpgradePlans(session.user.id),
    getSubscriptionBillingSummary(session.user.id)
  ]);

  if (!policy) {
    redirect("/login?callbackUrl=/settings/subscription");
  }

  return (
    <AppShell>
      <SecureSettingsPanel title="Subscription" description="View your current membership access and the active platform plan rules configured for this environment.">
        <SubscriptionSettingsDetail
          billing={billing}
          checkoutStatus={searchParams?.checkout}
          plans={plans}
          policy={policy}
          portalStatus={searchParams?.portal}
        />
      </SecureSettingsPanel>
    </AppShell>
  );
}
