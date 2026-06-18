import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { SecureSettingsPanel } from "@/components/settings-secure-areas/secure-settings-panel";

export default async function SubscriptionSettingsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/settings/subscription");
  }

  return (
    <AppShell>
      <SecureSettingsPanel title="Subscription" description="Membership tier, receipts, billing status, and account lifecycle controls belong here." />
    </AppShell>
  );
}
