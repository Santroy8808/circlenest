import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { DefaultHomeSettingsClient } from "@/components/settings-secure-areas/default-home-settings-client";
import { SecureSettingsPanel } from "@/components/settings-secure-areas/secure-settings-panel";
import { getDefaultHomeSettings } from "@/modules/home-preferences/default-home-preferences.service";

export default async function DefaultHomeSettingsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/settings/default-home");
  }

  const settings = await getDefaultHomeSettings(session.user.id);

  return (
    <AppShell>
      <SecureSettingsPanel
        title="Default Home Page"
        description="Choose where Theta-Space opens after login and when using the default home entry point. Choices are limited to pages available to your current membership."
      >
        <DefaultHomeSettingsClient initialOptions={settings.options} initialSelected={settings.selected} />
      </SecureSettingsPanel>
    </AppShell>
  );
}
