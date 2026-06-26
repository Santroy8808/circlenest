import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CreateEventForm } from "@/components/events/create-event-form";
import { FeatureUnavailableNotice } from "@/components/feature-availability/feature-unavailable-notice";
import { AppShell } from "@/components/platform/app-shell";
import { isAdminRole } from "@/lib/platform/roles";
import { logUnavailableFeatureClick } from "@/modules/feature-availability/feature-availability.service";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";

export default async function CreateEventPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/events/create");
  }

  const access =
    isAdminRole(session.user.role)
      ? { allowed: true, reason: "Admin role grants this platform control." }
      : await canUserAccessFeature(session.user.id, "events.create");

  if (!access.allowed) {
    await logUnavailableFeatureClick({
      actorUserId: session.user.id,
      featureKey: "events.create",
      label: "Create Event",
      requestedPath: "/events/create",
      source: "route-gate",
      reason: access.reason
    });

    return (
      <AppShell>
        <FeatureUnavailableNotice backHref="/events" backLabel="Back to Events" featureLabel="Create Event" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <CreateEventForm />
    </AppShell>
  );
}
