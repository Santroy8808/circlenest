import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const notifications = await prisma.notification.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, take: 50 });

  return (
    <AppShell>
      <div className="card p-4">
        <h1 className="mb-3 text-xl font-semibold">Notifications</h1>
        <div className="space-y-2">
          {notifications.map((n) => (
            <div key={n.id} className="rounded border border-slate-200 p-2 text-sm">
              <p className="font-medium">{n.type}</p>
              <p className="text-slate-700">{n.body}</p>
            </div>
          ))}
          {notifications.length === 0 ? <p className="text-sm text-slate-600">No notifications yet.</p> : null}
        </div>
      </div>
    </AppShell>
  );
}
