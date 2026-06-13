import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { SecureAreaSessionClient } from "@/components/security/secure-area-session-client";
import { MobileNavigationSettings } from "@/components/settings/mobile-navigation-settings";
import { requireSecureAreaPage } from "@/lib/security/secure-area-guards";

export default async function SettingsNavigationPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  requireSecureAreaPage(session.user.id, "/settings/navigation");

  return (
    <AppShell>
      <SecureAreaSessionClient />
      <section className="card p-4">
        <MobileNavigationSettings />
      </section>
    </AppShell>
  );
}
