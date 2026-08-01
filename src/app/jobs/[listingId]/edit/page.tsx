import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { CreateJobListingForm } from "@/components/jobs/create-job-listing-form";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { safeGetJobListingDetail } from "@/modules/jobs/jobs.service";

export default async function EditJobListingPage(props: { params: Promise<{ listingId: string }> }) {
  const params = await props.params;
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/jobs/${params.listingId}/edit`);
  }

  const activeActor = await getActiveAccountActor(session.user.id);
  const result = await safeGetJobListingDetail(activeActor.actorUserId, params.listingId);

  if (!result.ok) {
    notFound();
  }

  if (!result.job.viewerCanManage) {
    redirect(`/jobs/${result.job.slug}`);
  }

  return (
    <AppShell>
      <CreateJobListingForm initialJob={result.job} mode="edit" viewerCanCreate />
    </AppShell>
  );
}
