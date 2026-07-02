import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { NoticeList } from "@/components/notifications/notice-list";
import { AppShell } from "@/components/platform/app-shell";
import { listAlerts } from "@/modules/notifications-alerts/notifications-alerts.service";

export default async function AlertsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/alerts");
  }

  const items = await listAlerts(session.user.id);

  return (
    <AppShell>
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Special Inbox</p>
        <h1 className="mt-3 text-3xl font-semibold">Alerts</h1>
        <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
          System and platform announcements, admin replies, membership notices, and account-critical warnings belong here. Alerts can
          be dismissed and automatically expire after two weeks.
        </p>
      </section>
      <div className="mt-5">
        <NoticeList emptyTitle="No alerts yet" items={items} />
      </div>
    </AppShell>
  );
}
