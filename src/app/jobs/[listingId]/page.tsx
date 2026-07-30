import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { JobListingDetail } from "@/components/jobs/job-listing-detail";
import { AppShell } from "@/components/platform/app-shell";
import { safeGetJobListingDetail } from "@/modules/jobs/jobs.service";

export default async function JobListingPage(props: { params: Promise<{ listingId: string }> }) {
  const params = await props.params;
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/jobs/${params.listingId}`);
  }

  const result = await safeGetJobListingDetail(session.user.id, params.listingId);

  if (!result.ok) {
    notFound();
  }

  return (
    <AppShell>
      <JobListingDetail job={result.job} />
    </AppShell>
  );
}
