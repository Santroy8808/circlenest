import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { SecureActionGrid } from "@/components/settings-secure-areas/secure-action-grid";
import { SecureSettingsPanel } from "@/components/settings-secure-areas/secure-settings-panel";

export default async function RulesSettingsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/settings/rules");
  }

  return (
    <AppShell>
      <SecureSettingsPanel title="Rules" description="Control how Theta-Space notifies you and how routine communication rules behave.">
        <SecureActionGrid
          actions={[
            {
              title: "Notification Rules",
              description: "Review notifications, alerts, mail routing, quiet preferences, and cleanup behavior.",
              href: "/settings/notifications",
              badge: "notices"
            }
          ]}
        />
      </SecureSettingsPanel>
    </AppShell>
  );
}
