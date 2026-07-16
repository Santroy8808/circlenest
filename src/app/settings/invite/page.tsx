import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { isAdminRole } from "@/lib/platform/roles";
import { InviteSettingsClient } from "@/components/settings-secure-areas/invite-settings-client";
import { SecureSettingsPanel } from "@/components/settings-secure-areas/secure-settings-panel";
import { listOwnBulkInviteBatches, listOwnFreeAccountInvites } from "@/modules/membership-policy/free-account-invites.service";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";
import { isFeatureEnabled } from "@/modules/feature-flags/feature-flags.service";

export default async function InviteSettingsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/settings/invite");
  }

  const [access, bulkAccess, singleFeatureEnabled, bulkFeatureEnabled, invites, bulkBatches] = await Promise.all([
    canUserAccessFeature(session.user.id, "invites.send"),
    canUserAccessFeature(session.user.id, "invites.bulkSend"),
    isFeatureEnabled("membership.single_invites"),
    isFeatureEnabled("membership.bulk_invites"),
    listOwnFreeAccountInvites(session.user.id),
    listOwnBulkInviteBatches(session.user.id)
  ]);
  const admin = isAdminRole(session.user.role);
  if (!access.allowed && !bulkAccess.allowed && !admin) {
    redirect("/settings");
  }

  return (
    <AppShell>
      <SecureSettingsPanel title="Invite Controls" description="Generate private membership free-account invite codes when your account is eligible.">
        <InviteSettingsClient canInvite={singleFeatureEnabled && (access.allowed || admin)} canBulkInvite={bulkFeatureEnabled && (bulkAccess.allowed || admin)} initialInvites={invites} initialBulkBatches={bulkBatches} reason={!singleFeatureEnabled ? "Single invitations are currently disabled by Platform Management." : admin ? "Administrator access includes invite creation by default." : access.reason} bulkReason={!bulkFeatureEnabled ? "Bulk invitations are currently disabled by Platform Management." : admin ? "Administrator access includes bulk invitations by default." : bulkAccess.reason} />
      </SecureSettingsPanel>
    </AppShell>
  );
}
