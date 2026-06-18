import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { SecureSettingsPanel } from "@/components/settings-secure-areas/secure-settings-panel";

export default async function SecuritySettingsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/settings/security");
  }

  return (
    <AppShell>
      <SecureSettingsPanel title="Security" description="Password, sessions, blocked users, and admin-mode controls belong here." />
    </AppShell>
  );
}
