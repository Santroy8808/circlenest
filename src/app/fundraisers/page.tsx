import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { TierGate } from "@/components/policy/tier-gate";
import { canCreateFundRaiser, getMonthlyFundraiserLimit } from "@/lib/policy/tier-policy";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";
import { FundraiserCreateFormClient } from "@/components/fundraisers/fundraiser-create-form-client";
import { ReportControl } from "@/components/reports/report-control";
import { formatFundraiserType, summarizeText } from "@/lib/fundraisers/fundraisers";

export default async function FundraisersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, subscriptionTier: true },
  });
  const policy = resolveMemberAccessPolicy(session.user.id, user);
  const canCreate = canCreateFundRaiser(policy);
  const monthlyLimit = getMonthlyFundraiserLimit(policy);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const nextMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
  const currentMonthFundraiserCount =
    monthlyLimit !== null
      ? await prisma.fundraiser.count({
          where: {
            creatorId: session.user.id,
            createdAt: {
              gte: monthStart,
              lt: nextMonth,
            },
          },
        })
      : 0;
  const limitReached = monthlyLimit !== null && currentMonthFundraiserCount >= monthlyLimit;

  const fundraisers = await prisma.fundraiser.findMany({
    where: { status: "ACTIVE" },
    include: {
      creator: { select: { id: true, username: true } },
      _count: { select: { comments: true, adPlacements: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
  });

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Fund Raiser</h1>
          <p className="text-sm text-slate-500">Create a transparent campaign, show the runner, and keep the discussion attached to the fundraiser.</p>
        </div>

        {!canCreate ? (
          <TierGate
            variant="locked"
            title="Fund raiser locked"
            message="Upgrade to Activist to create fund raisers."
            ctaLabel="Open subscription"
            ctaHref="/settings/subscription"
            secondaryLabel="Compare memberships"
            secondaryHref="/membership"
            compact
          />
        ) : (
          <>
            {limitReached ? (
              <p className="rounded border border-amber-400/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
                Activist fund raisers are limited to {monthlyLimit} per month. You can create another next month.
              </p>
            ) : null}
            <FundraiserCreateFormClient canCreate={!limitReached && canCreate} />
          </>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {fundraisers.map((fundraiser) => (
            <article
              key={fundraiser.id}
              className="relative flex h-full flex-col overflow-hidden rounded border border-[var(--border)] bg-[#0d1320] transition hover:border-amber-300/60 hover:shadow-[0_8px_28px_rgba(0,0,0,0.28)]"
            >
              {fundraiser.bannerUrl ? (
                <div className="h-32 overflow-hidden border-b border-[var(--border)] bg-[#11192a]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fundraiser.bannerUrl} alt={`${fundraiser.title} banner`} className="h-full w-full object-cover" />
                </div>
              ) : null}

              <div className="flex h-full flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold leading-[1.45] text-[var(--text-strong)]">{fundraiser.title}</p>
                    <p className="text-xs text-slate-400">{formatFundraiserType(fundraiser.fundraiserType)}</p>
                  </div>
                  <span className="rounded-full border border-amber-400/30 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200">
                    ${fundraiser.goalAmount.toFixed(2)}
                  </span>
                </div>
                <p className="text-sm text-slate-300">Runner: {fundraiser.organizerName}</p>
                <p className="text-xs text-slate-400">
                  {fundraiser.locationCity}, {fundraiser.locationState}, {fundraiser.locationCountry}
                </p>
                <p className="text-sm text-slate-200">{summarizeText(fundraiser.description, 120)}</p>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
                  <p className="text-xs text-slate-500">
                    by @{fundraiser.creator.username}  -  {fundraiser._count.comments} comments  -  {fundraiser._count.adPlacements} ads
                  </p>
                  <div className="flex items-center gap-2">
                    {fundraiser.allowDirectMessages ? (
                      <span className="rounded-full border border-emerald-400/30 bg-emerald-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
                        DM open
                      </span>
                    ) : (
                      <span className="rounded-full border border-slate-400/30 bg-slate-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                        DM closed
                      </span>
                    )}
                    <ReportControl targetType="FUNDRAISER" targetId={fundraiser.id} label="Report fundraiser" compact triggerClassName="border-slate-400/30 bg-[#0f1728]" />
                  </div>
                </div>
                <Link href={`/fundraisers/${fundraiser.id}`} className="text-xs text-amber-200 underline">
                  Open fundraiser
                </Link>
              </div>
            </article>
          ))}
          {!fundraisers.length ? <p className="text-sm text-slate-500">No fund raisers yet.</p> : null}
        </div>
      </section>
    </AppShell>
  );
}
