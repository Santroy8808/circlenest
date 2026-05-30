import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { ensureBootstrapAdmins, isAdminUser, promoteAdminByEmail } from "@/lib/auth/admin";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  await ensureBootstrapAdmins();

  if (!(await isAdminUser(session.user.id))) redirect("/home");

  const logs = await prisma.moderatorActionLog.findMany({
    include: { actor: { select: { username: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const petitions = await prisma.adminPetition.findMany({
    include: { requester: { select: { username: true, email: true } } },
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
            const { promoteAdminByEmail, isAdminUser } = await import("@/lib/auth/admin");
            const current = await auth();
            if (!current?.user?.id) return;
            if (!(await isAdminUser(current.user.id))) return;
            const email = String(formData.get("email") ?? "").trim().toLowerCase();
            if (!email) return;
            try {
              await promoteAdminByEmail(email);
            } catch {
              return;
            }
          }}
          className="grid gap-2 md:grid-cols-2"
        >
          <input name="email" type="email" placeholder="User email to promote as admin" className="rounded border px-3 py-2 md:col-span-2" required />
          <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-white md:col-span-2">Promote to Admin</button>
        </form>

        <form
          action={async (formData) => {
            "use server";
            const { auth } = await import("@/auth");
            const { prisma } = await import("@/lib/db/prisma");
            const { isAdminUser } = await import("@/lib/auth/admin");
            const current = await auth();
            if (!current?.user?.id) return;
            if (!(await isAdminUser(current.user.id))) return;
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
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">User Petitions</h2>
          {petitions.map((petition) => (
            <article key={petition.id} className="rounded border border-[var(--border)] p-3 text-sm">
              <p className="font-medium">{petition.subject}</p>
              <p className="text-xs text-slate-500">@{petition.requester.username} • {petition.requester.email} • {petition.status}</p>
              <p className="mt-1 text-xs text-slate-300">{petition.details}</p>
            </article>
          ))}
          {petitions.length === 0 ? <p className="text-sm text-slate-500">No petitions yet.</p> : null}
        </section>
      </section>
    </AppShell>
  );
}
