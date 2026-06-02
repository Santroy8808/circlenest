import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminUser } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { canCreateEvent } from "@/lib/policy/events";
import { canModerateEvent } from "@/lib/auth/scoped-moderation";

export default async function EventsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const isAdmin = await isAdminUser(session.user.id);
  const events = await prisma.event.findMany({
    where: {
      OR: [
        { creatorId: session.user.id },
        { invitations: { some: { inviteeId: session.user.id } } },
        { moderators: { some: { userId: session.user.id } } },
      ],
    },
    include: {
      creator: { select: { username: true } },
      moderators: { include: { user: { select: { username: true } } } },
    },
    orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
    take: 100,
  });
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { subscriptionTier: true } });
  const canCreate = canCreateEvent(user?.subscriptionTier);

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div>
          <h1 className="text-xl font-semibold">Events</h1>
          <p className="text-sm text-slate-500">Events are invite-based. You can access events you create, are invited to, or moderate.</p>
        </div>
        <form
          action={async (formData) => {
            "use server";
            const { auth } = await import("@/auth");
            const { prisma } = await import("@/lib/db/prisma");
            const { revalidatePath } = await import("next/cache");
            const current = await auth();
            if (!current?.user?.id) return;
            const user = await prisma.user.findUnique({ where: { id: current.user.id }, select: { subscriptionTier: true } });
            if (!canCreateEvent(user?.subscriptionTier)) return;
            const title = String(formData.get("title") ?? "").trim();
            const startsAt = String(formData.get("startsAt") ?? "").trim();
            if (!title || !startsAt) return;
            const inviteUsernames = String(formData.get("inviteUsernames") ?? "")
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean);
            const moderatorUsernames = String(formData.get("moderatorUsernames") ?? "")
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean);
            const invitees = inviteUsernames.length
              ? await prisma.user.findMany({ where: { username: { in: inviteUsernames } }, select: { id: true } })
              : [];
            const moderators = moderatorUsernames.length
              ? await prisma.user.findMany({ where: { username: { in: moderatorUsernames } }, select: { id: true } })
              : [];
            const event = await prisma.event.create({
              data: {
                creatorId: current.user.id,
                title,
                startsAt: new Date(startsAt),
                endsAt: String(formData.get("endsAt") ?? "").trim() ? new Date(String(formData.get("endsAt"))) : null,
                locationName: String(formData.get("locationName") ?? "").trim() || null,
                description: String(formData.get("description") ?? "").trim() || null,
                visibility: "PRIVATE",
                invitations: invitees.length ? { create: invitees.map((invitee) => ({ inviteeId: invitee.id })) } : undefined,
              },
            });
            await prisma.eventModerator.create({ data: { eventId: event.id, userId: current.user.id, grantedById: current.user.id } });
            const moderatorIds = Array.from(new Set(moderators.map((moderator) => moderator.id).filter((id) => id !== current.user.id)));
            if (moderatorIds.length > 0) {
              await prisma.eventModerator.createMany({
                data: moderatorIds.map((userId) => ({ eventId: event.id, userId, grantedById: current.user.id })),
                skipDuplicates: true,
              });
            }
            const inviteNotifications = invitees
              .filter((invitee) => invitee.id !== current.user.id)
              .map((invitee) => ({
                userId: invitee.id,
                type: "EVENT_INVITE",
                body: `You were invited to event: ${title}`,
                targetUrl: "/events",
              }));
            if (inviteNotifications.length > 0) {
              await prisma.notification.createMany({ data: inviteNotifications });
            }
            revalidatePath("/events");
          }}
          className="grid gap-2 md:grid-cols-2"
        >
          <input name="title" placeholder="Event title" className="rounded border border-slate-300 px-3 py-2" required />
          <input name="locationName" placeholder="Location" className="rounded border border-slate-300 px-3 py-2" />
          <input name="startsAt" type="datetime-local" className="rounded border border-slate-300 px-3 py-2" required />
          <input name="endsAt" type="datetime-local" className="rounded border border-slate-300 px-3 py-2" />
          <input name="inviteUsernames" placeholder="Invite usernames (comma-separated)" className="rounded border border-slate-300 px-3 py-2" />
          <input name="moderatorUsernames" placeholder="Moderator usernames (comma-separated)" className="rounded border border-slate-300 px-3 py-2" />
          <input name="description" placeholder="Description" className="rounded border border-slate-300 px-3 py-2 md:col-span-2" />
          <button type="submit" disabled={!canCreate} className="rounded bg-slate-900 px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2">Create Event</button>
        </form>
        {!canCreate ? <p className="text-xs text-amber-300">Event creation is for paid members.</p> : null}
        <div className="space-y-2">
          {events.map((event) => {
            const isEventModerator = isAdmin || event.creatorId === session.user.id || event.moderators.some((moderator) => moderator.userId === session.user.id);
            return (
              <article key={event.id} className="rounded border border-[var(--border)] p-3 text-sm">
                <p className="font-medium">{event.title}</p>
                <p className="text-slate-500">{new Date(event.startsAt).toLocaleString()}</p>
                <p className="text-xs text-slate-500">by @{event.creator.username}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Moderators: {event.moderators.length ? event.moderators.map((moderator) => `@${moderator.user.username}`).join(", ") : "None"}
                </p>
                {isEventModerator ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex gap-2">
                      <form action={async () => {
                        "use server";
                        const { auth } = await import("@/auth");
                        const { prisma } = await import("@/lib/db/prisma");
                        const current = await auth();
                        if (!current?.user?.id) return;
                        if (!(await canModerateEvent(current.user.id, event.id))) return;
                        await prisma.event.deleteMany({ where: { id: event.id } });
                        const { revalidatePath } = await import("next/cache");
                        revalidatePath("/events");
                      }}>
                        <button type="submit" className="rounded border border-red-400 px-2 py-1 text-xs text-red-300">Delete</button>
                      </form>
                    </div>
                    <form
                      action={async (formData) => {
                        "use server";
                        const { auth } = await import("@/auth");
                        const { prisma } = await import("@/lib/db/prisma");
                        const { revalidatePath } = await import("next/cache");
                        const current = await auth();
                        if (!current?.user?.id) return;
                        if (!(await canModerateEvent(current.user.id, event.id))) return;
                        const moderatorUsernames = String(formData.get("moderatorUsernames") ?? "")
                          .split(",")
                          .map((value) => value.trim())
                          .filter(Boolean);
                        if (!moderatorUsernames.length) return;
                        const users = await prisma.user.findMany({
                          where: { username: { in: moderatorUsernames } },
                          select: { id: true },
                        });
                        const userIds = Array.from(new Set(users.map((user) => user.id).filter((id) => id !== current.user.id)));
                        if (userIds.length) {
                          await prisma.eventModerator.createMany({
                            data: userIds.map((userId) => ({ eventId: event.id, userId, grantedById: current.user.id })),
                            skipDuplicates: true,
                          });
                        }
                        revalidatePath("/events");
                      }}
                      className="grid gap-2 md:grid-cols-[1fr_auto]"
                    >
                      <input name="moderatorUsernames" placeholder="Add moderator usernames" className="rounded border border-slate-300 px-3 py-2" />
                      <button type="submit" className="rounded border border-slate-300 px-3 py-2 text-xs">Add Moderators</button>
                    </form>
                  </div>
                ) : null}
              </article>
            );
          })}
          {!events.length ? <p className="text-sm text-slate-500">No events yet.</p> : null}
        </div>
      </section>
    </AppShell>
  );
}
