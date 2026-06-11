import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { SecureAreaSessionClient } from "@/components/security/secure-area-session-client";
import { NotificationDingsSettings } from "@/components/settings/notification-dings-settings";
import { requireSecureAreaPage } from "@/lib/security/secure-area-guards";

export default async function SettingsNotificationDingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  requireSecureAreaPage(session.user.id, "/settings/security/notification-dings");

  return (
    <AppShell>
      <SecureAreaSessionClient />
      <section className="card p-4">
        <NotificationDingsSettings />
      </section>
    </AppShell>
  );
}
