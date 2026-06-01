import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";

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

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id, readAt: null },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

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
          Tap any notification to open it. Opening a notification marks it as read automatically.
        </p>
        <div className="space-y-2">
          {notifications.map((n) => (
            <div key={n.id} className="rounded border border-slate-200 p-2 text-sm hover:bg-[#13233a]">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/notifications/open?id=${encodeURIComponent(n.id)}`} className="min-w-0 flex-1">
                  <p className="font-medium">{n.type}</p>
                  <p className="text-slate-100">{n.body}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{new Date(n.createdAt).toLocaleString()}</p>
                </Link>
              </div>
            </div>
          ))}
          {notifications.length === 0 ? <p className="text-sm text-slate-300">No unread notifications.</p> : null}
        </div>
      </div>
    </AppShell>
  );
}
