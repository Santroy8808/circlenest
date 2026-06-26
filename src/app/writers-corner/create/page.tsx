import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { FeatureUnavailableNotice } from "@/components/feature-availability/feature-unavailable-notice";
import { AppShell } from "@/components/platform/app-shell";
import { CreateManuscriptForm } from "@/components/writers-corner/create-manuscript-form";
import { logUnavailableFeatureClick } from "@/modules/feature-availability/feature-availability.service";
import { getWriterAccessState } from "@/modules/writers-corner/writers-corner.service";

export default async function CreateManuscriptPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/writers-corner/create");
  }

  const access = await getWriterAccessState(session.user.id);

  if (!access.canWrite) {
    await logUnavailableFeatureClick({
      actorUserId: session.user.id,
      featureKey: "writers.access",
      label: "Create Manuscript",
      requestedPath: "/writers-corner/create",
      source: "route-gate",
      reason: access.reason
    });

    return (
      <AppShell>
        <FeatureUnavailableNotice backHref="/writers-corner" backLabel="Back to Writers Corner" featureLabel="Create Manuscript" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <CreateManuscriptForm access={access} />
    </AppShell>
  );
}
