"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ReportControl } from "@/components/reports/report-control";
import type { AdPlacementSummary } from "@/lib/ads/ads";
import { pickRotatingAd } from "@/lib/ads/ad-selection";

type JobBoardListing = {
  id: string;
  companyName: string;
  title: string;
  duties: string;
  requirements: string | null;
  imageUrl: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  location: string | null;
  employmentType: string | null;
  creator: {
    username: string;
  };
};

type JobsBoardClientProps = {
  jobs: JobBoardListing[];
  ads: AdPlacementSummary[];
  adSeed: number;
};

function formatPay(job: JobBoardListing) {
  if (job.salaryMin === null && job.salaryMax === null) return "Not listed";
  const min = job.salaryMin !== null ? `$${job.salaryMin.toFixed(2)}` : "Any";
  const max = job.salaryMax !== null ? `$${job.salaryMax.toFixed(2)}` : "Any";
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

function jobSummary(job: JobBoardListing) {
  return job.duties.length > 20 ? `${job.duties.slice(0, 20)}...` : job.duties;
}

function AdCard({ ad, targetLabel }: { ad: AdPlacementSummary | null; targetLabel: string }) {
  return (
    <article className="flex h-full flex-col rounded border border-amber-400/30 bg-amber-300/10 p-3 text-sm text-amber-100">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-amber-200">Sponsored</p>
          <p className="text-lg font-semibold">{ad ? ad.headline : `Promote in ${targetLabel}`}</p>
        </div>
        <span className="rounded-full border border-amber-200/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-amber-100">
          Ad
        </span>
      </div>
      <p className="mt-2 text-sm text-amber-50/90">{ad?.body || `One ad card per six ${targetLabel.toLowerCase()} listings.`}</p>
      {ad ? <p className="mt-3 text-xs text-amber-100/80">by @{ad.creator.username}</p> : null}
    </article>
  );
}

function JobListingCard({ job, onOpen }: { job: JobBoardListing; onOpen: () => void }) {
  return (
    <article className="relative flex h-full min-h-[260px] flex-col overflow-hidden rounded border border-[var(--border)] bg-[#0d1320] transition hover:border-amber-300/60 hover:shadow-[0_8px_28px_rgba(0,0,0,0.28)]">
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full w-full flex-col gap-1 px-4 py-4 pr-12 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-amber-300/70"
        aria-label={`Open ${job.title} listing`}
      >
        <p className="text-[14px] font-semibold leading-[1.45] text-[var(--text-strong)]">{job.title}</p>
        <p className="text-sm text-slate-300">{job.companyName}</p>
        <p className="text-xs text-slate-400">Location: {job.location || "No location"}</p>
        <p className="text-xs text-slate-400">Pay: {formatPay(job)}</p>
        <p className="text-xs text-slate-400">Type: {formatEmploymentType(job.employmentType)}</p>
        <p className="text-sm text-slate-200">Summary: {jobSummary(job)}</p>
        <p className="mt-auto pt-4 text-xs text-slate-500">Click to open full listing</p>
      </button>

      <div className="absolute right-2 top-2 z-20">
        <ReportControl
          targetType="JOB_LISTING"
          targetId={job.id}
          label="Report job"
          compact
          triggerClassName="border-slate-400/30 bg-[#0f1728]"
        />
      </div>
    </article>
  );
}

export function JobsBoardClient({ jobs, ads, adSeed }: JobsBoardClientProps) {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) ?? null, [jobs, selectedJobId]);

  useEffect(() => {
    if (!selectedJobId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedJobId(null);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedJobId]);

  const boardItems = [];
  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    boardItems.push(<JobListingCard key={job.id} job={job} onOpen={() => setSelectedJobId(job.id)} />);
    if ((index + 1) % 6 === 0) {
      const slotIndex = Math.floor(index / 6);
      const ad = pickRotatingAd(ads, slotIndex, adSeed);
      boardItems.push(<AdCard key={`ad-${job.id}`} ad={ad} targetLabel="hiring board" />);
    }
  }

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {boardItems}
        {!boardItems.length ? <p className="text-sm text-slate-500">No listings match current filters.</p> : null}
      </div>

      {selectedJob ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4" onClick={() => setSelectedJobId(null)}>
          <div
            className="flex w-full max-w-5xl max-h-[92vh] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[#0c1220] shadow-[0_24px_80px_rgba(0,0,0,0.72)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-[var(--text-strong)]">{selectedJob.title}</p>
                <p className="truncate text-sm text-slate-300">{selectedJob.companyName}</p>
              </div>
              <button
                type="button"
                className="rounded border border-[var(--border)] px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/5"
                onClick={() => setSelectedJobId(null)}
              >
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                <div className="space-y-3">
                  {selectedJob.imageUrl ? (
                    <Image
                      src={selectedJob.imageUrl}
                      alt={`${selectedJob.title} listing photo`}
                      width={1600}
                      height={1200}
                      unoptimized
                      className="max-h-[50vh] w-full rounded border border-[var(--border)] object-cover"
                    />
                  ) : null}
                  <div className="rounded border border-[var(--border)] bg-[#0b1220] p-3 text-sm text-slate-200">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Listing details</p>
                    <div className="mt-3 space-y-1.5 text-sm">
                      <p>Location: {selectedJob.location || "No location"}</p>
                      <p>Pay: {formatPay(selectedJob)}</p>
                      <p>Type: {formatEmploymentType(selectedJob.employmentType)}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded border border-[var(--border)] bg-[#0b1220] p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Full description</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-100">{selectedJob.duties}</p>
                  </div>
                  {selectedJob.requirements ? (
                    <div className="rounded border border-[var(--border)] bg-[#0b1220] p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Requirements</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">{selectedJob.requirements}</p>
                    </div>
                  ) : null}
                  <p className="text-xs text-slate-500">Posted by @{selectedJob.creator.username}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
