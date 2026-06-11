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
          <article className="rounded border border-[var(--border)] p-4">
            <h2 className="text-base font-semibold text-[var(--text-strong)]">View job listings</h2>
            <p className="mt-1 text-sm text-slate-400">Search and filter the current job board.</p>
            <Link href="/jobs" className="mt-3 inline-flex rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-strong)]">
              Open job board
            </Link>
          </article>
          <article className="rounded border border-[var(--border)] p-4">
            <h2 className="text-base font-semibold text-[var(--text-strong)]">Create job listing</h2>
            <p className="mt-1 text-sm text-slate-400">
              {canCreate ? "Your tier can post job listings." : "Your tier cannot create job listings yet."}
            </p>
            <Link href={canCreate ? "/jobs/new" : "/settings/subscription"} className="mt-3 inline-flex rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-strong)]">
              {canCreate ? "Open job creator" : "Open subscription"}
            </Link>
          </article>
        </div>
      </section>
    </AppShell>
  );
}
