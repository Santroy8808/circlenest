import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminUser } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { AdPlacementPanel } from "@/components/ads/ad-placement-panel";
import { TierGate } from "@/components/policy/tier-gate";
import { canCreateEvent } from "@/lib/policy/tier-policy";
import { getProAdCreditBalance, serializeAdPlacements } from "@/lib/ads/ads";
import { canModerateEvent } from "@/lib/auth/scoped-moderation";
import { ReportControl } from "@/components/reports/report-control";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";

export default async function EventsPage({ searchParams }: { searchParams?: { created?: string } }) {
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
      adPlacements: {
        include: { creator: { select: { id: true, username: true } } },
        orderBy: [{ createdAt: "desc" }],
      },
    },
    orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
    take: 100,
  });
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true, subscriptionTier: true } });
  const policy = resolveMemberAccessPolicy(session.user.id, user);
  const canCreate = canCreateEvent(policy);
  const adCreditBalance = policy.tier === "PRO" || policy.tier === "AUDITOR" ? await getProAdCreditBalance(session.user.id, policy) : null;
  const adCreditLabel =
    policy.tier === "PRO"
      ? `Biz ad credits: ${adCreditBalance ?? 0}`
      : policy.tier === "AUDITOR"
        ? `Auditor ad credits: ${adCreditBalance ?? 0}`
      : policy.tier === "CONTRIBUTOR"
        ? "Contributor members need Biz or Auditor for ads."
        : policy.tier === "ADMIN"
          ? "Admin ad access: unlimited."
          : "Upgrade to Biz or Auditor to create ads.";

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div>
          <h1 className="text-xl font-semibold">Events</h1>
          <p className="text-sm text-slate-500">Events are invite-based. You can access events you create, are invited to, or moderate.</p>
        </div>
        {searchParams?.created === "1" ? (
          <p className="rounded border border-emerald-400/40 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-200">
            Event created.
          </p>
        ) : null}
        <p className="text-xs text-slate-400">{adCreditLabel}</p>
        {!canCreate ? (
          <TierGate
            variant="locked"
            title="Events locked"
            message="Upgrade to Contributor to create events."
            ctaLabel="Open subscription"
            ctaHref="/settings/subscription"
            secondaryLabel="Compare memberships"
            secondaryHref="/membership"
            compact
          />
        ) : null}
        {canCreate ? (
        <form
          key={searchParams?.created ?? "initial"}
          action={async (formData) => {
            "use server";
            const { auth } = await import("@/auth");
            const { prisma } = await import("@/lib/db/prisma");
            const current = await auth();
            if (!current?.user?.id) return;
            const user = await prisma.user.findUnique({ where: { id: current.user.id }, select: { role: true, subscriptionTier: true } });
            const policy = resolveMemberAccessPolicy(current.user.id, user);
            if (!canCreateEvent(policy)) return;
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
              await Promise.all(
                moderatorIds.map((userId) =>
                  prisma.eventModerator.upsert({
                    where: { eventId_userId: { eventId: event.id, userId } },
                    create: { eventId: event.id, userId, grantedById: current.user.id },
                    update: { grantedById: current.user.id },
                  }),
                ),
              );
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
            redirect(`/events?created=${Date.now()}`);
          }}
          className="grid gap-2 md:grid-cols-2"
        >
          <input disabled={!canCreate} name="title" placeholder="Event title" className="rounded border border-slate-300 px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100" required />
          <input disabled={!canCreate} name="locationName" placeholder="Location" className="rounded border border-slate-300 px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100" />
          <input disabled={!canCreate} name="startsAt" type="datetime-local" className="rounded border border-slate-300 px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100" required />
          <input disabled={!canCreate} name="endsAt" type="datetime-local" className="rounded border border-slate-300 px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100" />
          <input disabled={!canCreate} name="inviteUsernames" placeholder="Invite usernames (comma-separated)" className="rounded border border-slate-300 px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100" />
          <input disabled={!canCreate} name="moderatorUsernames" placeholder="Moderator usernames (comma-separated)" className="rounded border border-slate-300 px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100" />
          <input disabled={!canCreate} name="description" placeholder="Description" className="rounded border border-slate-300 px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100 md:col-span-2" />
          <button type="submit" disabled={!canCreate} className="rounded bg-slate-900 px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2">Create Event</button>
        </form>
        ) : (
          <div className="rounded border border-[var(--border)] bg-[#0d1320] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-amber-200">Create event</p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--text-strong)]">Example event card</h2>
            <p className="mt-1 text-sm text-slate-400">Invite-only events show a title, time, location, description, moderators, and optional ad tools.</p>
            <div className="mt-4 rounded border border-[var(--border)] bg-[#111a2a] p-4 text-sm text-slate-300">
              <p className="font-semibold text-[var(--text-strong)]">Private dinner meetup</p>
              <p className="mt-1">Tuesday, 7:00 PM â€¢ Downtown â€¢ Created by @host</p>
              <p className="mt-2 text-xs text-slate-400">Invite names, assign moderators, and manage ads from this card.</p>
            </div>
          </div>
        )}
        <div className="space-y-2">
          {events.map((event, index) => {
            const isEventModerator = isAdmin || event.creatorId === session.user.id || event.moderators.some((moderator) => moderator.userId === session.user.id);
            return (
              <article key={event.id} className="rounded border border-[var(--border)] p-3 text-sm">
                <p className="font-medium">{event.title}</p>
                <p className="text-slate-500">{new Date(event.startsAt).toLocaleString()}</p>
              <p className="text-xs text-slate-500">by @{event.creator.username}</p>
              <p className="mt-1 text-xs text-slate-500">
                Moderators: {event.moderators.length ? event.moderators.map((moderator) => `@${moderator.user.username}`).join(", ") : "None"}
              </p>
              <div className="mt-2 max-w-sm">
                <ReportControl targetType="EVENT" targetId={event.id} label="Report event" compact />
              </div>
              <div className="mt-3">
                <AdPlacementPanel
                  targetType="EVENT_LISTING"
                  createEndpoint={`/api/events/${event.id}/ads`}
                  targetLabel="Event listing ads"
                  canCreate={canCreate}
                  ownsTarget={isAdmin || event.creatorId === session.user.id}
                  requiresCredits={policy.tier === "PRO" || policy.tier === "AUDITOR"}
                  creditBalance={adCreditBalance}
                  ads={serializeAdPlacements(event.adPlacements)}
                  slotIndex={index}
                />
              </div>
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
                          await Promise.all(
                            userIds.map((userId) =>
                              prisma.eventModerator.upsert({
                                where: { eventId_userId: { eventId: event.id, userId } },
                                create: { eventId: event.id, userId, grantedById: current.user.id },
                                update: { grantedById: current.user.id },
                              }),
                            ),
                          );
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
