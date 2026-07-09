import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { SettingsHub } from "@/components/settings-secure-areas/settings-hub";
import { getSettingsCards } from "@/modules/settings-secure-areas/settings-secure-areas.service";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/settings");
  }

  const inviteAccess = await canUserAccessFeature(session.user.id, "invites.send");

  return (
    <AppShell>
      <SettingsHub cards={getSettingsCards({ includeInvites: inviteAccess.allowed })} />
    </AppShell>
  );
}
