import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { CreateManuscriptForm } from "@/components/writers-corner/create-manuscript-form";
import { logUnavailableFeatureClick } from "@/modules/feature-availability/feature-availability.service";
import { resolveMembershipRouteAccess } from "@/modules/membership-policy/route-access";
import { getWriterAccessState } from "@/modules/writers-corner/writers-corner.service";

export default async function CreateManuscriptPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/writers-corner/create");
  }

  const [routeAccess, access] = await Promise.all([
    resolveMembershipRouteAccess(session.user.id, "writersCreate", "page"),
    getWriterAccessState(session.user.id)
  ]);

  if (!routeAccess.allowed || !access.canWrite) {
    await logUnavailableFeatureClick({
      actorUserId: session.user.id,
      featureKey: "writers.access",
      label: "Create Manuscript",
      requestedPath: "/writers-corner/create",
      source: "route-gate",
      reason: access.reason
    });

    notFound();
  }

  return (
    <AppShell>
      <CreateManuscriptForm access={access} />
    </AppShell>
  );
}
