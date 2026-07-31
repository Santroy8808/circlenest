import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { JobListingDetail } from "@/components/jobs/job-listing-detail";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { safeGetJobListingDetail } from "@/modules/jobs/jobs.service";

export default async function MarketJobListingPage(props: { params: Promise<{ listingId: string }> }) {
  const params = await props.params;
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/market/jobs/${params.listingId}`);
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
