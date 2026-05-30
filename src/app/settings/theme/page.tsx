import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { SecureAreaSessionClient } from "@/components/security/secure-area-session-client";
import { ThemeSettingsClient } from "@/components/settings/theme-settings-client";
import { requireSecureAreaPage } from "@/lib/security/secure-area-guards";

export default async function ThemeSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  requireSecureAreaPage(session.user.id, "/settings/theme");

  return (
    <AppShell>
      <SecureAreaSessionClient />
      <ThemeSettingsClient />
    </AppShell>
  );
}
