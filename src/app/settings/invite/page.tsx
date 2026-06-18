import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { SecureSettingsPanel } from "@/components/settings-secure-areas/secure-settings-panel";

export default async function InviteSettingsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/settings/invite");
  }

  return (
    <AppShell>
      <SecureSettingsPanel title="Invite Controls" description="Invite eligibility, invite-code history, and private membership invite controls belong here." />
    </AppShell>
  );
}
