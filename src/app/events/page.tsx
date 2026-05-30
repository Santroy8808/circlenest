import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { resolveProductionZoneAccess } from "@/lib/policy/production-zone";

export default async function EventsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const events = await prisma.event.findMany({
    include: { creator: { select: { username: true } } },
    orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
    take: 100,
  });
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { subscriptionTier: true, iasStatus: true } });
  const access = resolveProductionZoneAccess(user?.subscriptionTier, user?.iasStatus === "INVITED_CREATOR");

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div>
          <h1 className="text-xl font-semibold">Events</h1>
          <p className="text-sm text-slate-500">Events are now a standalone domain, separate from groups.</p>
        </div>
        <form
          action={async (formData) => {
            "use server";
            const { auth } = await import("@/auth");
            const { prisma } = await import("@/lib/db/prisma");
            const current = await auth();
            if (!current?.user?.id) return;
            const user = await prisma.user.findUnique({ where: { id: current.user.id }, select: { subscriptionTier: true, iasStatus: true } });
            const access = resolveProductionZoneAccess(user?.subscriptionTier, user?.iasStatus === "INVITED_CREATOR");
            if (!access.canCreate) return;
            const title = String(formData.get("title") ?? "").trim();
            const startsAt = String(formData.get("startsAt") ?? "").trim();
            if (!title || !startsAt) return;
            await prisma.event.create({
              data: {
                creatorId: current.user.id,
                title,
                startsAt: new Date(startsAt),
                endsAt: String(formData.get("endsAt") ?? "").trim() ? new Date(String(formData.get("endsAt"))) : null,
                locationName: String(formData.get("locationName") ?? "").trim() || null,
                description: String(formData.get("description") ?? "").trim() || null,
                visibility: String(formData.get("visibility") ?? "PUBLIC") === "PRIVATE" ? "PRIVATE" : "PUBLIC",
              },
            });
          }}
          className="grid gap-2 md:grid-cols-2"
        >
          <input name="title" placeholder="Event title" className="rounded border border-slate-300 px-3 py-2" required />
          <input name="locationName" placeholder="Location" className="rounded border border-slate-300 px-3 py-2" />
          <input name="startsAt" type="datetime-local" className="rounded border border-slate-300 px-3 py-2" required />
          <input name="endsAt" type="datetime-local" className="rounded border border-slate-300 px-3 py-2" />
          <select name="visibility" className="rounded border border-slate-300 px-3 py-2">
            <option value="PUBLIC">Public</option>
            <option value="PRIVATE">Private</option>
          </select>
          <input name="description" placeholder="Description" className="rounded border border-slate-300 px-3 py-2" />
          <button type="submit" disabled={!access.canCreate} className="rounded bg-slate-900 px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2">Create Event</button>
        </form>
        {!access.canCreate ? <p className="text-xs text-amber-300">{access.reason}</p> : null}
        <div className="space-y-2">
          {events.map((event) => (
            <article key={event.id} className="rounded border border-[var(--border)] p-3 text-sm">
              <p className="font-medium">{event.title}</p>
              <p className="text-slate-500">{new Date(event.startsAt).toLocaleString()}</p>
              <p className="text-xs text-slate-500">by @{event.creator.username}</p>
              {event.creatorId === session.user.id ? (
                <div className="mt-2 flex gap-2">
                  <form action={async () => {
                    "use server";
                    const { auth } = await import("@/auth");
                    const { prisma } = await import("@/lib/db/prisma");
                    const current = await auth();
                    if (!current?.user?.id) return;
                    await prisma.event.deleteMany({ where: { id: event.id, creatorId: current.user.id } });
                  }}>
                    <button type="submit" className="rounded border border-red-400 px-2 py-1 text-xs text-red-300">Delete</button>
                  </form>
                </div>
              ) : null}
            </article>
          ))}
          {!events.length ? <p className="text-sm text-slate-500">No events yet.</p> : null}
        </div>
      </section>
    </AppShell>
  );
}
