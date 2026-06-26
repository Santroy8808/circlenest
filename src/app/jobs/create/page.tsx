import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CreateJobListingForm } from "@/components/jobs/create-job-listing-form";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { viewerCanCreateJob } from "@/modules/jobs/jobs.service";

export default async function CreateJobPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/jobs/create");
  }

  const activeActor = await getActiveAccountActor(session.user.id);
  const canCreate = await viewerCanCreateJob(activeActor.actorUserId);

  return (
    <AppShell>
      <CreateJobListingForm viewerCanCreate={canCreate} />
    </AppShell>
  );
}
