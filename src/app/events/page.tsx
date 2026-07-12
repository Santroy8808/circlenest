import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { EventsDirectoryClient } from "@/components/events/events-directory-client";
import { AppShell } from "@/components/platform/app-shell";
import { safeListEvents } from "@/modules/events/events.service";
import { getEffectivePolicyForUser } from "@/modules/membership-policy/membership-policy.service";

export default async function EventsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/events");
  }

  const policy = await getEffectivePolicyForUser(session.user.id);
  if (!policy || policy.actualTier === MembershipTier.FREE) {
    return (
      <AppShell>
        <section className="surface rounded-md p-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Events</p>
          <h1 className="mt-3 text-3xl font-semibold text-[var(--gold)]">Not yet available</h1>
          <p className="mt-3 text-[var(--muted)]">Events are not currently enabled for Free memberships.</p>
        </section>
      </AppShell>
    );
  }

  const result = await safeListEvents(session.user.id);

  return (
    <AppShell>
      <EventsDirectoryClient initialEvents={result.events} viewerCanCreate={result.viewerCanCreate} />
    </AppShell>
  );
}
import { MembershipTier } from "@prisma/client";
