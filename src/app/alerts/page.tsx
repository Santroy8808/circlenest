import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";

async function markAlertRead(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  await prisma.alert.updateMany({
    where: { id, userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/alerts");
}

async function markAllAlertsRead() {
  "use server";
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  await prisma.alert.updateMany({
    where: { userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/alerts");
}

export default async function AlertsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const alerts = await prisma.alert.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <AppShell>
      <div className="space-y-3">
        <div className="card p-4">
          <h1 className="text-xl font-semibold">Alerts</h1>
          <p className="mt-2 text-sm text-slate-300">
            Alerts are incoming updates generated from things you already subscribed to elsewhere. This page is read-only for subscriptions and only lets you review or clear incoming alerts.
          </p>
        </div>

        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Incoming Alerts</h2>
            <form action={markAllAlertsRead}>
              <button type="submit" className="text-xs underline">Mark all read</button>
            </form>
          </div>
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div key={alert.id} className="rounded border border-[var(--border)] p-2 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{alert.type}</p>
                    <p className="text-slate-300">{alert.body}</p>
                  </div>
                  {alert.readAt ? (
                    <span className="text-[11px] text-slate-500">Read</span>
                  ) : (
                    <form action={markAlertRead}>
                      <input type="hidden" name="id" value={alert.id} />
                      <button type="submit" className="text-xs underline">Mark read</button>
                    </form>
                  )}
                </div>
              </div>
            ))}
            {alerts.length === 0 ? <p className="text-sm text-slate-400">No alerts yet.</p> : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
