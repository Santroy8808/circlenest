import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { SettingsHub } from "@/components/settings-secure-areas/settings-hub";
import { getSettingsCards } from "@/modules/settings-secure-areas/settings-secure-areas.service";

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/settings");
  }

  return (
    <AppShell>
      <SettingsHub cards={getSettingsCards()} />
    </AppShell>
  );
}
