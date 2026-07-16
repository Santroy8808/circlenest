import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { SettingsHub } from "@/components/settings-secure-areas/settings-hub";
import { getSettingsCards } from "@/modules/settings-secure-areas/settings-secure-areas.service";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";
import { isAdminRole } from "@/lib/platform/roles";
import { isFeatureEnabled } from "@/modules/feature-flags/feature-flags.service";

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/settings");
  }

  const [inviteAccess, bulkInviteAccess, singleInvitesEnabled, bulkInvitesEnabled, feedbackCenterEnabled] = await Promise.all([
    canUserAccessFeature(session.user.id, "invites.send"),
    canUserAccessFeature(session.user.id, "invites.bulkSend"),
    isFeatureEnabled("membership.single_invites"),
    isFeatureEnabled("membership.bulk_invites"),
    isFeatureEnabled("support.feedback_center")
  ]);

  return (
    <AppShell>
      <SettingsHub cards={getSettingsCards({
        includeInvites: (singleInvitesEnabled && inviteAccess.allowed) || (bulkInvitesEnabled && bulkInviteAccess.allowed) || (isAdminRole(session.user.role) && (singleInvitesEnabled || bulkInvitesEnabled)),
        includeFeedback: feedbackCenterEnabled
      })} />
    </AppShell>
  );
}
