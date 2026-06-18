import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { SecureSettingsPanel } from "@/components/settings-secure-areas/secure-settings-panel";

export default async function NotificationSettingsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/settings/notifications");
  }

  return (
    <AppShell>
      <SecureSettingsPanel title="Notification Rules" description="Notification dings, quiet rules, mail opt-outs, and alert preferences belong here." />
    </AppShell>
  );
}
