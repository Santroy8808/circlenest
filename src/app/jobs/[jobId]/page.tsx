import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { prisma } from "@/lib/db/prisma";
import { ReportControl } from "@/components/reports/report-control";

function formatPay(salaryMin: number | null, salaryMax: number | null) {
  if (salaryMin === null && salaryMax === null) return "Not listed";
  const min = salaryMin !== null ? `$${salaryMin.toFixed(2)}` : "Any";
  const max = salaryMax !== null ? `$${salaryMax.toFixed(2)}` : "Any";
  return `${min} - ${max}`;
}

function formatEmploymentType(value: string | null) {
  if (!value) return "Open";
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function JobDetailPage({ params }: { params: { jobId: string } }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const job = await prisma.jobListing.findFirst({
    where: { id: params.jobId, status: "ACTIVE" },
    include: { creator: { select: { username: true, email: true } } },
  });

  if (!job) notFound();

  const contactEmail = job.contactEmail ?? job.creator.email;

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Job listing</p>
            <h1 className="text-2xl font-semibold text-[var(--text-strong)]">{job.title}</h1>
            <p className="text-sm text-slate-300">{job.companyName}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/jobs" className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-slate-100">
              Back to jobs
            </Link>
            <ReportControl targetType="JOB_LISTING" targetId={job.id} label="Report job" />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            {job.imageUrl ? (
              <Image
                src={job.imageUrl}
                alt={`${job.title} listing photo`}
                width={1024}
                height={768}
                sizes="(min-width: 1024px) 620px, 100vw"
                className="max-h-[50vh] w-full rounded-[16px] border border-[var(--border)] object-cover"
              />
            ) : null}
            <article className="rounded-[16px] border border-[var(--border)] bg-[#10192a] p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Full description</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-100">{job.duties}</p>
            </article>
            {job.requirements ? (
              <article className="rounded-[16px] border border-[var(--border)] bg-[#10192a] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Requirements</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-200">{job.requirements}</p>
              </article>
            ) : null}
          </div>

          <div className="space-y-4">
            <article className="rounded-[16px] border border-[var(--border)] bg-[#10192a] p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Listing details</p>
              <div className="mt-3 space-y-2 text-sm text-slate-200">
                <p>Location: {job.location || "No location"}</p>
                <p>Pay: {formatPay(job.salaryMin, job.salaryMax)}</p>
                <p>Type: {formatEmploymentType(job.employmentType)}</p>
                <p>Posted by: @{job.creator.username}</p>
              </div>
            </article>

            <article className="rounded-[16px] border border-[var(--border)] bg-[#10192a] p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Contact</p>
              <div className="mt-3 space-y-3 text-sm text-slate-200">
                {contactEmail ? (
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Email</p>
                    <a href={`mailto:${contactEmail}`} className="mt-1 block break-all text-[var(--text-strong)]">
                      {contactEmail}
                    </a>
                  </div>
                ) : null}
                {job.contactPhone ? (
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Phone</p>
                    <a href={`tel:${job.contactPhone}`} className="mt-1 block text-[var(--text-strong)]">
                      {job.contactPhone}
                    </a>
                  </div>
                ) : null}
                {job.applicationUrl ? (
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Apply</p>
                    <a href={job.applicationUrl} target="_blank" rel="noreferrer" className="mt-1 block break-all text-[var(--text-strong)]">
                      {job.applicationUrl}
                    </a>
                  </div>
                ) : null}
                {!contactEmail && !job.contactPhone && !job.applicationUrl ? (
                  <p className="text-sm text-slate-400">No contact details have been added yet.</p>
                ) : null}
              </div>
            </article>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
