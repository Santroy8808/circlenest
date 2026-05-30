import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { subscriptionTier: true } });
  if (me?.subscriptionTier !== "DIAMOND") {
    return (
      <AppShell>
        <section className="card p-4 text-sm text-amber-300">Admin portal is restricted.</section>
      </AppShell>
    );
  }

  const logs = await prisma.moderatorActionLog.findMany({
    include: { actor: { select: { username: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <h1 className="text-xl font-semibold">Admin Portal</h1>
        <form
          action={async (formData) => {
            "use server";
            const { auth } = await import("@/auth");
            const { prisma } = await import("@/lib/db/prisma");
            const current = await auth();
            if (!current?.user?.id) return;
            const me = await prisma.user.findUnique({ where: { id: current.user.id }, select: { subscriptionTier: true } });
            if (me?.subscriptionTier !== "DIAMOND") return;
            const action = String(formData.get("action") ?? "").trim();
            const targetType = String(formData.get("targetType") ?? "").trim();
            const targetId = String(formData.get("targetId") ?? "").trim();
            if (!action || !targetType || !targetId) return;
            await prisma.moderatorActionLog.create({
              data: {
                actorUserId: current.user.id,
                action,
                targetType,
                targetId,
                note: String(formData.get("note") ?? "").trim() || null,
              },
            });
          }}
          className="grid gap-2 md:grid-cols-2"
        >
          <input name="action" placeholder="Action (DELETE_PROFILE, BAN_GROUP...)" className="rounded border px-3 py-2" required />
          <input name="targetType" placeholder="Target type (USER/GROUP/EVENT...)" className="rounded border px-3 py-2" required />
          <input name="targetId" placeholder="Target id" className="rounded border px-3 py-2 md:col-span-2" required />
          <textarea name="note" placeholder="Moderator note" className="rounded border px-3 py-2 md:col-span-2" />
          <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-white md:col-span-2">Log Action</button>
        </form>
        <div className="space-y-2">
          {logs.map((log) => (
            <article key={log.id} className="rounded border border-[var(--border)] p-3 text-sm">
              <p className="font-medium">{log.action}</p>
              <p className="text-xs text-slate-500">{log.targetType} • {log.targetId} • by @{log.actor.username}</p>
              {log.note ? <p className="text-xs text-slate-400">{log.note}</p> : null}
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

