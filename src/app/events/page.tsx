import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { EventsDirectoryClient } from "@/components/events/events-directory-client";
import { AppShell } from "@/components/platform/app-shell";
import { isAdminRole } from "@/lib/platform/roles";
import { safeListEvents } from "@/modules/events/events.service";
import { getEffectivePolicyForUser } from "@/modules/membership-policy/membership-policy.service";

export default async function EventsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/events");
  }

  const policy = await getEffectivePolicyForUser(session.user.id);
  if (!isAdminRole(session.user.role) && (!policy || !policy.features["events.create"])) notFound();

  const result = await safeListEvents(session.user.id);

  return (
    <AppShell>
      <EventsDirectoryClient initialEvents={result.events} viewerCanCreate={result.viewerCanCreate} />
    </AppShell>
  );
}
