import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { SecureSettingsPanel } from "@/components/settings-secure-areas/secure-settings-panel";
import { SubscriptionSettingsDetail } from "@/components/settings-secure-areas/subscription-settings-detail";
import { listSubscriptionPlanRules } from "@/modules/membership-policy/launch-access.service";
import { getEffectivePolicyForUser } from "@/modules/membership-policy/membership-policy.service";

export default async function SubscriptionSettingsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/settings/subscription");
  }

  const [policy, plans] = await Promise.all([getEffectivePolicyForUser(session.user.id), listSubscriptionPlanRules()]);

  if (!policy) {
    redirect("/login?callbackUrl=/settings/subscription");
  }

  return (
    <AppShell>
      <SecureSettingsPanel title="Subscription" description="View your current membership access and the active platform plan rules configured for this environment.">
        <SubscriptionSettingsDetail policy={policy} plans={plans} />
      </SecureSettingsPanel>
    </AppShell>
  );
}
