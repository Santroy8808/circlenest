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
      <SecureSettingsPanel title="Security" description="Account protection, login safety, blocked users, and visibility controls.">
        <SecureActionGrid
          actions={[
            {
              title: "Blocked Users",
              description: "Review accounts you have blocked and remove blocks when needed.",
              href: "/settings/security/blocked-users",
              badge: "people"
            },
            {
              title: "Login Security",
              description: "Reset your password and refresh login protection. Completing password reset revokes old sessions.",
              href: "/reset-password",
              badge: "password"
            },
            {
              title: "Site Visibility",
              description: "Change whether your profile is public, member-only, or more private.",
              href: "/profile/edit",
              badge: "visibility"
            }
          ]}
        />
      </SecureSettingsPanel>
    </AppShell>
  );
}
