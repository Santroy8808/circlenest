import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { JobListingDetail } from "@/components/jobs/job-listing-detail";
import { AppShell } from "@/components/platform/app-shell";
import { PublicJobDetail } from "@/components/public-jobs/public-job-detail";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { safeGetJobListingDetail, safeGetPublicJobListingDetail } from "@/modules/jobs/jobs.service";

export default async function JobListingPage(props: { params: Promise<{ listingId: string }> }) {
  const params = await props.params;
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    const result = await safeGetPublicJobListingDetail(params.listingId);
    if (!result.ok) notFound();
    return <PublicJobDetail job={result.job} />;
  }

  const activeActor = await getActiveAccountActor(session.user.id);
  const result = await safeGetJobListingDetail(activeActor.actorUserId, params.listingId);

  if (!result.ok) {
    notFound();
  }

  return (
    <AppShell>
      <JobListingDetail job={result.job} />
    </AppShell>
  );
}
