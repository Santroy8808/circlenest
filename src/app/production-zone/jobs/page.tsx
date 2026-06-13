import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { prisma } from "@/lib/db/prisma";
import { canCreateHiringPost } from "@/lib/policy/tier-policy";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";

export default async function ProductionZoneJobsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, subscriptionTier: true },
  });
  const policy = resolveMemberAccessPolicy(session.user.id, user);
  const canCreate = canCreateHiringPost(policy);

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div>
          <h1 className="text-xl font-semibold">Production Zone: Find a Job</h1>
          <p className="text-sm text-slate-400">Browse the board first, then open the dedicated job-listing creator if your tier supports it.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Link
            href="/jobs"
            className="block rounded border border-[var(--border)] p-4 transition hover:border-[var(--accent)]/40 hover:bg-[color:var(--card-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
          >
            <h2 className="text-base font-semibold text-[var(--text-strong)]">View job listings</h2>
            <p className="mt-1 text-sm text-slate-400">Search and filter the current job board.</p>
          </Link>
          <Link
            href="/jobs/new"
            className="block rounded border border-[var(--border)] p-4 transition hover:border-[var(--accent)]/40 hover:bg-[color:var(--card-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
          >
            <h2 className="text-base font-semibold text-[var(--text-strong)]">Create job listing</h2>
            <p className="mt-1 text-sm text-slate-400">
              {canCreate ? "Biz can post job listings." : "Only Biz can create job listings."}
            </p>
            <span className="mt-3 inline-flex rounded border border-[var(--border)] px-3 py-2 text-sm text-slate-400">
              {canCreate ? "Job creator is available on the main page." : "Job creation is Biz-only."}
            </span>
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
