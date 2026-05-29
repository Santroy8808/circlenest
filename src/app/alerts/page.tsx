import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";

const baseAlertTemplates = [
  { type: "GROUP_EVENT", sourceType: "GROUP", sourceId: "global-events", label: "All group event reminders" },
  { type: "WRITER_CHAPTER", sourceType: "WRITER", sourceId: "followed-writers", label: "New chapters from subscribed writers" },
  { type: "PROJECT_STATUS", sourceType: "PROJECT", sourceId: "my-projects", label: "Project status updates you subscribed to" },
] as const;

async function subscribeToAlert(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const type = String(formData.get("type") ?? "").trim();
  const sourceType = String(formData.get("sourceType") ?? "").trim();
  const sourceId = String(formData.get("sourceId") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  if (!type || !sourceType || !sourceId || !label) return;

  await prisma.alertSubscription.upsert({
    where: {
      userId_type_sourceType_sourceId: { userId: session.user.id, type, sourceType, sourceId },
    },
    update: { label, isActive: true },
    create: { userId: session.user.id, type, sourceType, sourceId, label, isActive: true },
  });

  revalidatePath("/alerts");
}

async function toggleAlertSubscription(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const id = String(formData.get("id") ?? "").trim();
  const nextState = String(formData.get("nextState") ?? "").trim() === "1";
  if (!id) return;

  await prisma.alertSubscription.updateMany({
    where: { id, userId: session.user.id },
    data: { isActive: nextState },
  });
  revalidatePath("/alerts");
}

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

  const [alerts, subscriptions, memberships] = await Promise.all([
    prisma.alert.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.alertSubscription.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.groupMember.findMany({
      where: { userId: session.user.id },
      select: { group: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const templates = [
    ...baseAlertTemplates,
    ...memberships.map((membership) => ({
      type: "GROUP_EVENT",
      sourceType: "GROUP",
      sourceId: membership.group.id,
      label: `${membership.group.name} event reminders`,
    })),
  ];

  const subscriptionMap = new Map(
    subscriptions.map((s) => [`${s.type}:${s.sourceType}:${s.sourceId}`, s]),
  );

  return (
    <AppShell>
      <div className="space-y-3">
        <div className="card p-4">
          <h1 className="text-xl font-semibold">Alerts</h1>
          <p className="mt-2 text-sm text-slate-300">
            Alerts are opt-in updates you requested. Notifications are social activity from others, such as messages, mentions, tags, and friend requests.
          </p>
        </div>

        <div className="card p-4">
          <h2 className="mb-2 text-lg font-semibold">My Alert Subscriptions</h2>
          <div className="space-y-2">
            {templates.map((template) => {
              const key = `${template.type}:${template.sourceType}:${template.sourceId}`;
              const active = subscriptionMap.get(key);
              return (
                <div key={key} className="flex items-center justify-between rounded border border-[var(--border)] px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-slate-100">{template.label}</p>
                    <p className="text-xs text-slate-400">{template.type}</p>
                  </div>
                  {active ? (
                    <form action={toggleAlertSubscription}>
                      <input type="hidden" name="id" value={active.id} />
                      <input type="hidden" name="nextState" value={active.isActive ? "0" : "1"} />
                      <button type="submit" className="underline">
                        {active.isActive ? "Unsubscribe" : "Re-subscribe"}
                      </button>
                    </form>
                  ) : (
                    <form action={subscribeToAlert}>
                      <input type="hidden" name="type" value={template.type} />
                      <input type="hidden" name="sourceType" value={template.sourceType} />
                      <input type="hidden" name="sourceId" value={template.sourceId} />
                      <input type="hidden" name="label" value={template.label} />
                      <button type="submit" className="underline">Subscribe</button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
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
