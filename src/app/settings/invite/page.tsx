import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { InviteSettingsClient } from "@/components/settings-secure-areas/invite-settings-client";
import { SecureSettingsPanel } from "@/components/settings-secure-areas/secure-settings-panel";
import { listOwnFreeAccountInvites } from "@/modules/membership-policy/free-account-invites.service";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";

export default async function InviteSettingsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/settings/invite");
  }

  const [access, invites] = await Promise.all([canUserAccessFeature(session.user.id, "invites.send"), listOwnFreeAccountInvites(session.user.id)]);

  return (
    <AppShell>
      <SecureSettingsPanel title="Invite Controls" description="Generate private membership free-account invite codes when your account is eligible.">
        <InviteSettingsClient canInvite={access.allowed} initialInvites={invites} reason={access.reason} />
      </SecureSettingsPanel>
    </AppShell>
  );
}
