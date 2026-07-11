import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { SecureActionGrid } from "@/components/settings-secure-areas/secure-action-grid";
import { SecureSettingsPanel } from "@/components/settings-secure-areas/secure-settings-panel";
import { isInternalMailEnabled } from "@/modules/mail/mail.service";

export default async function NotificationSettingsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/settings/notifications");
  }

  const mailEnabled = isInternalMailEnabled();

  return (
    <AppShell>
      <SecureSettingsPanel
        title="Notification Rules"
        description={mailEnabled ? "Open the working notification and alert inboxes. Mail recipient controls are managed inside Mail." : "Open the working notification and alert inboxes."}
      >
        <SecureActionGrid
          actions={[
            {
              title: "Notifications",
              description: "View and act on mentions, replies, family requests, and social updates.",
              href: "/notifications",
              badge: "social"
            },
            {
              title: "Alerts",
              description: "Open account-critical notices, admin replies, reports, invoices, and platform announcements.",
              href: "/alerts",
              badge: "critical"
            },
            ...(mailEnabled
              ? [
                  {
                    title: "Mail",
                    description: "Manage formal internal mail, recipients, and message threads.",
                    href: "/mail",
                    badge: "mail"
                  }
                ]
              : [])
          ]}
        />
      </SecureSettingsPanel>
    </AppShell>
  );
}
