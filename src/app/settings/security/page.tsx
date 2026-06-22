import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { SecureActionGrid } from "@/components/settings-secure-areas/secure-action-grid";
import { SecureSettingsPanel } from "@/components/settings-secure-areas/secure-settings-panel";

export default async function SecuritySettingsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/settings/security");
  }

  return (
    <AppShell>
      <SecureSettingsPanel title="Security" description="Account protection actions that are available now. Admin session revocation stays in the Admin portal.">
        <SecureActionGrid
          actions={[
            {
              title: "Reset password",
              description: "Send yourself through the password-reset flow. Completing it revokes old sessions.",
              href: "/reset-password",
              badge: "password"
            },
            {
              title: "Blocked users",
              description: "Review accounts you have blocked and remove blocks when needed.",
              href: "/settings/security/blocked-users",
              badge: "people"
            },
            {
              title: "Admin security tools",
              description: "Admins can revoke suspicious sessions and review security activity from the Admin portal.",
              href: "/admin",
              badge: "admin"
            }
          ]}
        />
      </SecureSettingsPanel>
    </AppShell>
  );
}
