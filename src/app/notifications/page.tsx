import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { NoticeCenterClient, type NoticeCenterItem } from "@/components/notifications/notice-center-client";
import { AppShell } from "@/components/platform/app-shell";
import { listAlerts, listNotifications } from "@/modules/notifications-alerts/notifications-alerts.service";

export default async function NotificationsPage({ searchParams }: { searchParams?: { view?: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/notifications");
  }

  const [notifications, alerts] = await Promise.all([listNotifications(session.user.id), listAlerts(session.user.id)]);
  const items: NoticeCenterItem[] = [
    ...alerts.map((item) => ({ ...item, kind: "alert" as const })),
    ...notifications.map((item) => ({ ...item, kind: "notification" as const }))
  ].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const initialFilter = searchParams?.view === "alerts" ? "alert" : searchParams?.view === "notifications" ? "notification" : "all";

  return (
    <AppShell>
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Communications</p>
        <h1 className="mt-3 text-3xl font-semibold">Notifications & Alerts</h1>
        <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
          Social updates and requests share this inbox with system alerts. Alerts are marked red so account-critical items stay
          distinguishable.
        </p>
      </section>
      <div className="mt-5">
        <NoticeCenterClient initialFilter={initialFilter} initialItems={items} />
      </div>
    </AppShell>
  );
}
