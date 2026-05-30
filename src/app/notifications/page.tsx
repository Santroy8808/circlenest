import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";

async function markNotificationRead(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  await prisma.notification.updateMany({
    where: { id, userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}

async function markAllNotificationsRead() {
  "use server";
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await prisma.notification.updateMany({
    where: { userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const notifications = await prisma.notification.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, take: 50 });

  return (
    <AppShell>
      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Notifications</h1>
          <form action={markAllNotificationsRead}>
            <button type="submit" className="text-xs underline">Mark all read</button>
          </form>
        </div>
        <p className="mb-3 text-sm text-slate-300">
          Notifications are activity from others or the platform: mentions, messages, tags, friend requests, and reactions.
          Opt-in reminders you requested are in Alerts.
        </p>
        <div className="space-y-2">
          {notifications.map((n) => (
            <div key={n.id} className="rounded border border-slate-200 p-2 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{n.type}</p>
                  <p className="text-slate-100">{n.body}</p>
                </div>
                {n.readAt ? (
                  <span className="text-[11px] text-slate-300">Read</span>
                ) : (
                  <form action={markNotificationRead}>
                    <input type="hidden" name="id" value={n.id} />
                    <button type="submit" className="text-xs underline">Mark read</button>
                  </form>
                )}
              </div>
            </div>
          ))}
          {notifications.length === 0 ? <p className="text-sm text-slate-300">No notifications yet.</p> : null}
        </div>
      </div>
    </AppShell>
  );
}
