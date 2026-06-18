import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { JobsBoardClient } from "@/components/jobs/jobs-board-client";
import { AppShell } from "@/components/platform/app-shell";
import { safeListJobListings, viewerCanCreateJob } from "@/modules/jobs/jobs.service";

export default async function JobsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/jobs");
  }

  const [listings, canCreate] = await Promise.all([safeListJobListings(), viewerCanCreateJob(session.user.id)]);

  return (
    <AppShell>
      <JobsBoardClient initialListings={listings} viewerCanCreate={canCreate} />
    </AppShell>
  );
}
