import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CreateJobListingForm } from "@/components/jobs/create-job-listing-form";
import { AppShell } from "@/components/platform/app-shell";
import { viewerCanCreateJob } from "@/modules/jobs/jobs.service";

export default async function CreateJobPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/jobs/create");
  }

  const canCreate = await viewerCanCreateJob(session.user.id);

  return (
    <AppShell>
      <CreateJobListingForm viewerCanCreate={canCreate} />
    </AppShell>
  );
}
