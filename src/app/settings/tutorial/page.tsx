import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { TutorialSettingsClient } from "@/components/settings-secure-areas/tutorial-settings-client";

export default async function TutorialSettingsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/settings/tutorial");
  }

  return (
    <AppShell>
      <TutorialSettingsClient />
    </AppShell>
  );
}
