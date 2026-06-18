import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { NoticeList } from "@/components/notifications/notice-list";
import { AppShell } from "@/components/platform/app-shell";
import { listNotifications } from "@/modules/notifications-alerts/notifications-alerts.service";

export default async function NotificationsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/notifications");
  }

  const items = await listNotifications(session.user.id);

  return (
    <AppShell>
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Communications</p>
        <h1 className="mt-3 text-3xl font-semibold">Notifications</h1>
        <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
          Mentions, replies, and ordinary social updates live here. Alerts stay separate for admin and account-critical notices.
        </p>
      </section>
      <div className="mt-5">
        <NoticeList emptyTitle="No notifications yet" items={items} />
      </div>
    </AppShell>
  );
}
