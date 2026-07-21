import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { WritersCornerDashboard } from "@/components/writers-corner/writers-corner-dashboard";
import { logUnavailableFeatureClick } from "@/modules/feature-availability/feature-availability.service";
import { resolveMembershipRouteAccess } from "@/modules/membership-policy/route-access";
import { getWriterAccessState, safeListManuscripts } from "@/modules/writers-corner/writers-corner.service";

export default async function WritersCornerPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/writers-corner");
  }

  const [routeAccess, access] = await Promise.all([
    resolveMembershipRouteAccess(session.user.id, "writersCreate", "page"),
    getWriterAccessState(session.user.id)
  ]);

  if (!routeAccess.allowed || !access.canWrite) {
    await logUnavailableFeatureClick({
      actorUserId: session.user.id,
      featureKey: "writers.access",
      label: "Writers Corner",
      requestedPath: "/writers-corner",
      source: "route-gate",
      reason: access.reason
    });

    notFound();
  }

  const manuscripts = await safeListManuscripts(session.user.id);

  return (
    <AppShell>
      <WritersCornerDashboard access={access} manuscripts={manuscripts} />
    </AppShell>
  );
}
