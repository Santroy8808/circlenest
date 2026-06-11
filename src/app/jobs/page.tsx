import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { resolveAdRotationSeed } from "@/lib/ads/ad-selection";
import { getProAdCreditBalance, serializeAdPlacements } from "@/lib/ads/ads";
import { canCreateHiringPost } from "@/lib/policy/tier-policy";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";
import { JobsBoardClient } from "@/components/jobs/jobs-board-client";

type JobsPageSearchParams = {
  created?: string;
  q?: string;
  location?: string;
  employmentType?: string;
  minSalary?: string;
  maxSalary?: string;
};

export default async function JobsPage({ searchParams }: { searchParams?: JobsPageSearchParams }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const q = String(searchParams?.q ?? "").trim();
  const location = String(searchParams?.location ?? "").trim();
  const employmentType = String(searchParams?.employmentType ?? "").trim();
  const minSalary = String(searchParams?.minSalary ?? "").trim();
  const maxSalary = String(searchParams?.maxSalary ?? "").trim();

  const where: Record<string, unknown> = { status: "ACTIVE" };
  const and: Record<string, unknown>[] = [];
  if (q) {
    and.push({
      OR: [
        { companyName: { contains: q } },
        { title: { contains: q } },
        { duties: { contains: q } },
        { requirements: { contains: q } },
      ],
    });
  }
  if (location) and.push({ location: { contains: location } });
  if (employmentType) and.push({ employmentType: { contains: employmentType } });
  const minSalaryValue = Number(minSalary);
  if (minSalary && !Number.isNaN(minSalaryValue)) and.push({ OR: [{ salaryMin: { gte: minSalaryValue } }, { salaryMax: { gte: minSalaryValue } }] });
  const maxSalaryValue = Number(maxSalary);
  if (maxSalary && !Number.isNaN(maxSalaryValue)) and.push({ OR: [{ salaryMax: { lte: maxSalaryValue } }, { salaryMin: { lte: maxSalaryValue } }] });
  if (and.length) where.AND = and;

  const jobs = await prisma.jobListing.findMany({
    where,
    include: {
      creator: { select: { id: true, username: true } },
      adPlacements: { include: { creator: { select: { id: true, username: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true, subscriptionTier: true } });
  const policy = resolveMemberAccessPolicy(session.user.id, user);
  const canCreate = canCreateHiringPost(policy);
  const adCreditBalance = policy.tier === "PRO" || policy.tier === "AUDITOR" ? await getProAdCreditBalance(session.user.id, policy) : null;
  const adCreditLabel =
    policy.isAdmin
      ? "Admin ad access: unlimited."
      : policy.tier === "PRO"
        ? `Pro ad credits: ${adCreditBalance ?? 0}`
        : policy.tier === "AUDITOR"
          ? `Auditor ad credits: ${adCreditBalance ?? 0}`
          : policy.tier === "PLUS"
            ? "Activist members need Pro or Auditor for job ads."
            : "Upgrade to be able to create ads.";
  const showAdCreditLabel = canCreate || policy.canCreateAds || policy.isAdmin;

  const adPool = jobs.flatMap((job) => serializeAdPlacements(job.adPlacements));
  const adSeed = resolveAdRotationSeed();

  const boardJobs = jobs.map((job) => ({
    id: job.id,
    companyName: job.companyName,
    title: job.title,
    duties: job.duties,
    requirements: job.requirements ?? null,
    imageUrl: job.imageUrl ?? null,
    salaryMin: job.salaryMin ?? null,
    salaryMax: job.salaryMax ?? null,
    location: job.location ?? null,
    employmentType: job.employmentType ?? null,
    creator: {
      username: job.creator.username,
    },
  }));

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Find a job</h1>
          <p className="text-sm text-slate-500">Browse member job listings and open each post for full details.</p>
        </div>
        <form method="get" className="grid gap-2 rounded border border-[var(--border)] p-3 md:grid-cols-6">
          <input name="q" defaultValue={q} placeholder="Search title, company, duties" className="rounded border px-3 py-2 text-sm md:col-span-2" />
          <input name="location" defaultValue={location} placeholder="Location" className="rounded border px-3 py-2 text-sm" />
          <input name="employmentType" defaultValue={employmentType} placeholder="Type (Full-time, Contract...)" className="rounded border px-3 py-2 text-sm" />
          <input name="minSalary" defaultValue={minSalary} type="number" step="0.01" placeholder="Min salary" className="rounded border px-3 py-2 text-sm" />
          <input name="maxSalary" defaultValue={maxSalary} type="number" step="0.01" placeholder="Max salary" className="rounded border px-3 py-2 text-sm" />
          <div className="flex flex-wrap gap-2 md:col-span-6">
            <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-sm text-white">
              Search board
            </button>
            {(q || location || employmentType || minSalary || maxSalary) ? (
              <Link href="/jobs" className="rounded border border-[var(--border)] px-3 py-2 text-sm">
                Clear
              </Link>
            ) : null}
            {canCreate ? (
              <Link href="/jobs/new" className="rounded border border-[var(--border)] px-3 py-2 text-sm">
                Create job listing
              </Link>
            ) : (
              <Link href="/settings/subscription" className="rounded border border-amber-400/40 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
                Upgrade to be able to post jobs
              </Link>
            )}
          </div>
        </form>
        {searchParams?.created ? <p className="rounded border border-emerald-400/40 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-200">Job posted.</p> : null}
        {showAdCreditLabel ? <p className="text-xs text-slate-400">{adCreditLabel}</p> : null}
        {!canCreate ? <p className="rounded border border-amber-400/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">Upgrade to be able to post a job listing.</p> : null}
        <JobsBoardClient jobs={boardJobs} ads={adPool} adSeed={adSeed} />
      </section>
    </AppShell>
  );
}



