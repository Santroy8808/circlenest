import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { TierGate } from "@/components/policy/tier-gate";
import { canCreateHiringPost } from "@/lib/policy/tier-policy";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";
import { JobListingFormClient } from "@/components/jobs/job-listing-form-client";

export default async function JobsCreatePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true, subscriptionTier: true } });
  const policy = resolveMemberAccessPolicy(session.user.id, user);
  const canCreate = canCreateHiringPost(policy);

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Make a job listing</h1>
          <p className="text-sm text-slate-500">Post a member hiring listing to Find a job.</p>
        </div>
        {!canCreate ? (
          <TierGate
            variant="locked"
            title="Job posting locked"
            message="Upgrade to be able to post a job listing."
            ctaLabel="Upgrade to post"
            ctaHref="/settings/subscription"
            secondaryLabel="Back to Find a job"
            secondaryHref="/jobs"
            compact
          />
        ) : (
          <JobListingFormClient canCreate={canCreate} />
        )}
      </section>
    </AppShell>
  );
}
