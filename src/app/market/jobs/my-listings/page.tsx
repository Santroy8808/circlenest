import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MyJobListings } from "@/components/jobs/my-job-listings";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { safeListOwnedJobListings, viewerCanCreateJob } from "@/modules/jobs/jobs.service";

export default async function MyMarketJobListingsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/market/jobs/my-listings");
  }

  const activeActor = await getActiveAccountActor(session.user.id);
  const [listings, canCreate] = await Promise.all([
    safeListOwnedJobListings(activeActor.actorUserId),
    viewerCanCreateJob(activeActor.actorUserId)
  ]);

  return (
    <AppShell>
      <MyJobListings listings={listings} viewerCanCreate={canCreate} />
    </AppShell>
  );
}
