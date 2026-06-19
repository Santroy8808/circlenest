import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { JobsBoardClient } from "@/components/jobs/jobs-board-client";
import { AppShell } from "@/components/platform/app-shell";
import { safeListJobListings, viewerCanCreateJob } from "@/modules/jobs/jobs.service";
import { getListingViewPreference } from "@/modules/listing-preferences/listing-preferences.service";

export default async function JobsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/jobs");
  }

  const [listings, canCreate, initialView] = await Promise.all([
    safeListJobListings(),
    viewerCanCreateJob(session.user.id),
    getListingViewPreference(session.user.id, "jobs", "square")
  ]);

  return (
    <AppShell>
      <JobsBoardClient initialListings={listings} initialView={initialView} viewerCanCreate={canCreate} />
    </AppShell>
  );
}
