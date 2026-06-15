import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { DirectMessageButton } from "@/components/messages/direct-message-button";
import { ReportControl } from "@/components/reports/report-control";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";
import { FundraiserDiscussionClient } from "@/components/fundraisers/fundraiser-discussion-client";
import { formatFundraiserType } from "@/lib/fundraisers/fundraisers";
import { isAdminUser } from "@/lib/auth/admin";

type FundraiserPageProps = {
  params: { fundraiserId: string };
};

export default async function FundraiserPage({ params }: FundraiserPageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, subscriptionTier: true },
  });
  const policy = resolveMemberAccessPolicy(session.user.id, user);
  const fundraiser = await prisma.fundraiser.findUnique({
    where: { id: params.fundraiserId },
    include: {
      creator: { select: { id: true, username: true } },
      comments: {
        include: { author: { select: { id: true, username: true } } },
        orderBy: [{ createdAt: "asc" }],
      },
    },
  });
  if (!fundraiser) redirect("/fundraisers");

  const discussionFundraiser = {
    id: fundraiser.id,
    title: fundraiser.title,
    description: fundraiser.description,
    goalAmount: fundraiser.goalAmount,
    fundraiserType: fundraiser.fundraiserType,
    charityName: fundraiser.charityName,
    organizationName: fundraiser.organizationName,
    campaignName: fundraiser.campaignName,
    otherDescription: fundraiser.otherDescription,
    locationCountry: fundraiser.locationCountry,
    locationState: fundraiser.locationState,
    locationCity: fundraiser.locationCity,
    currentOrg: fundraiser.currentOrg,
    currentService: fundraiser.currentService,
    additionalNotes: fundraiser.additionalNotes,
    bannerUrl: fundraiser.bannerUrl,
    allowDirectMessages: fundraiser.allowDirectMessages,
    organizerName: fundraiser.organizerName,
    creator: {
      id: fundraiser.creator.id,
      username: fundraiser.creator.username,
    },
    comments: fundraiser.comments.map((comment) => ({
      id: comment.id,
      content: comment.content,
      mediaUrlsJson: comment.mediaUrlsJson,
      createdAt: comment.createdAt.toISOString(),
      parentCommentId: comment.parentCommentId,
      author: {
        id: comment.author.id,
        username: comment.author.username,
      },
    })),
  };

  const isAdmin = await isAdminUser(session.user.id);

  return (
    <AppShell>
      <div className="fixed inset-0 z-40 overflow-y-auto bg-black/75 p-4 pt-6">
        <section className="mx-auto flex w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[#0c1220] shadow-[0_24px_80px_rgba(0,0,0,0.72)]">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-semibold text-[var(--text-strong)]">{fundraiser.title}</p>
                <span className="rounded-full border border-amber-400/30 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200">
                  {formatFundraiserType(fundraiser.fundraiserType)}
                </span>
              </div>
              <p className="text-sm text-slate-400">
                Created by @{fundraiser.creator.username}  -  Run by {fundraiser.organizerName}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ReportControl targetType="FUNDRAISER" targetId={fundraiser.id} label="Report fundraiser" compact triggerClassName="border-slate-400/30 bg-[#0f1728]" />
              <Link href="/fundraisers" className="rounded border border-[var(--border)] px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/5">
                Close
              </Link>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                {fundraiser.bannerUrl ? (
                  <Image
                    src={fundraiser.bannerUrl}
                    alt={`${fundraiser.title} banner`}
                    width={1600}
                    height={720}
                    unoptimized
                    className="max-h-[40vh] w-full rounded border border-[var(--border)] object-cover"
                  />
                ) : null}
                <div className="rounded border border-[var(--border)] bg-[#0b1220] p-4 text-sm text-slate-200">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Campaign summary</p>
                  <p className="mt-3 whitespace-pre-wrap leading-6">{fundraiser.description}</p>
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    <p>Goal: ${fundraiser.goalAmount.toFixed(2)}</p>
                    <p>
                      Location: {fundraiser.locationCity}, {fundraiser.locationState}, {fundraiser.locationCountry}
                    </p>
                    {fundraiser.currentOrg ? <p>Your current org: {fundraiser.currentOrg}</p> : null}
                    {fundraiser.currentService ? <p>Your current service: {fundraiser.currentService}</p> : null}
                  </div>
                  {fundraiser.additionalNotes ? (
                    <div className="mt-4 rounded border border-[var(--border)] bg-[#11192a] p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Additional notes</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{fundraiser.additionalNotes}</p>
                    </div>
                  ) : null}
                </div>

                <FundraiserDiscussionClient fundraiser={discussionFundraiser} currentUserId={session.user.id} />
              </div>

              <div className="space-y-4">
                <div className="rounded border border-[var(--border)] bg-[#0b1220] p-4 text-sm text-slate-200">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Transparency</p>
                  <div className="mt-3 space-y-2">
                    <p>Runner: {fundraiser.organizerName}</p>
                    <p>Creator: @{fundraiser.creator.username}</p>
                    <p>Type: {formatFundraiserType(fundraiser.fundraiserType)}</p>
                    <p>
                      Campaign target: {fundraiser.charityName || fundraiser.organizationName || fundraiser.campaignName || fundraiser.otherDescription || "Not set"}
                    </p>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {fundraiser.allowDirectMessages && fundraiser.creator.id !== session.user.id ? (
                      <DirectMessageButton username={fundraiser.creator.username} label="DM runner" />
                    ) : fundraiser.allowDirectMessages ? (
                      <span className="rounded border border-emerald-400/30 bg-emerald-300/10 px-3 py-2 text-xs text-emerald-200">
                        You are the runner.
                      </span>
                    ) : (
                      <span className="rounded border border-slate-400/30 bg-slate-300/10 px-3 py-2 text-xs text-slate-300">
                        Direct messages disabled.
                      </span>
                    )}
                  </div>
                </div>

                <div className="rounded border border-[var(--border)] bg-[#0b1220] p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Promotion</p>
                  <p className="mt-2 text-sm text-slate-400">Run fundraiser ads through the standard campaign builder. Ads stay in the ad stream, never inside the fundraiser listing.</p>
                  {isAdmin || fundraiser.creatorId === session.user.id ? (
                    <Link
                      href={`/production-zone/business/ads?targetType=FUNDRAISER_LISTING&targetId=${encodeURIComponent(fundraiser.id)}&title=${encodeURIComponent(`Promote ${fundraiser.title}`)}&articleTitle=${encodeURIComponent(fundraiser.title)}&articleBody=${encodeURIComponent(fundraiser.description || `Support ${fundraiser.title}.`)}`}
                      className="mt-3 inline-flex rounded-full border border-[var(--accent)]/45 px-3 py-1.5 text-xs font-semibold text-[var(--text-strong)] transition hover:-translate-y-0.5 hover:bg-[var(--accent)]/10"
                    >
                      Promote fundraiser
                    </Link>
                  ) : (
                    <p className="mt-3 text-xs text-slate-500">Only the fundraiser runner can launch promotions.</p>
                  )}
                </div>

                <div className="rounded border border-[var(--border)] bg-[#0b1220] p-4 text-sm text-slate-200">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Visibility</p>
                  <p className="mt-2">Everyone can see who is running this fundraiser.</p>
                  <p className="mt-1">DM status: {fundraiser.allowDirectMessages ? "Open" : "Closed"}</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
