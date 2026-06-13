import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { getDisplayMembershipTierName, getTierPolicy, resolveUserAccessPolicy } from "@/lib/policy/tier-policy";
import { prisma } from "@/lib/db/prisma";

function yesNo(value: boolean) {
  return value ? "Yes" : "No";
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return "Unlimited";
  const mb = Math.round(bytes / (1024 * 1024));
  return `${mb} MB`;
}

function freeLabel(value: string, available: boolean) {
  return available ? value : <span className="text-slate-400 line-through decoration-slate-500/80 decoration-2">{value}</span>;
}

export default async function MembershipPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, subscriptionTier: true },
  });
  const currentPolicy = resolveUserAccessPolicy(currentUser);
  const free = getTierPolicy("FREE");
  const plus = getTierPolicy("PLUS");
  const biz = getTierPolicy("PRO");
  const auditor = getTierPolicy("AUDITOR");
  const rows = [
    {
      label: "Create groups",
      free: yesNo(free.canCreateGroup),
      plus: yesNo(plus.canCreateGroup),
      biz: yesNo(biz.canCreateGroup),
      auditor: yesNo(auditor.canCreateGroup),
    },
    {
      label: "Group member cap",
      free: free.maxCreatedGroupMembers ? `Up to ${free.maxCreatedGroupMembers}` : "Unlimited",
      plus: plus.maxCreatedGroupMembers ? `Up to ${plus.maxCreatedGroupMembers}` : "Unlimited",
      biz: biz.maxCreatedGroupMembers ? `Up to ${biz.maxCreatedGroupMembers}` : "Unlimited",
      auditor: auditor.maxCreatedGroupMembers ? `Up to ${auditor.maxCreatedGroupMembers}` : "Unlimited",
    },
    {
      label: "Create events",
      free: yesNo(free.canCreateEvent),
      plus: yesNo(plus.canCreateEvent),
      biz: yesNo(biz.canCreateEvent),
      auditor: yesNo(auditor.canCreateEvent),
    },
    {
      label: "Market listings",
      free: yesNo(free.canCreateBazaarListing),
      plus: yesNo(plus.canCreateBazaarListing),
      biz: yesNo(biz.canCreateBazaarListing),
      auditor: yesNo(auditor.canCreateBazaarListing),
    },
    {
      label: "Hiring posts",
      free: yesNo(free.canCreateHiringPost),
      plus: yesNo(plus.canCreateHiringPost),
      biz: yesNo(biz.canCreateHiringPost),
      auditor: yesNo(auditor.canCreateHiringPost),
    },
    {
      label: "Fund raisers",
      free: yesNo(free.canCreateFundRaiser),
      plus: yesNo(plus.canCreateFundRaiser),
      biz: yesNo(biz.canCreateFundRaiser),
      auditor: yesNo(auditor.canCreateFundRaiser),
    },
    {
      label: "Change feed type",
      free: yesNo(free.canChangeFeedType),
      plus: yesNo(plus.canChangeFeedType),
      biz: yesNo(biz.canChangeFeedType),
      auditor: yesNo(auditor.canChangeFeedType),
    },
    {
      label: "Create ads",
      free: yesNo(free.canCreateAds),
      plus: yesNo(plus.canCreateAds),
      biz: yesNo(biz.canCreateAds),
      auditor: yesNo(auditor.canCreateAds),
    },
    {
      label: "Monthly ad credits",
      free: String(free.monthlyAdCredits),
      plus: String(plus.monthlyAdCredits),
      biz: String(biz.monthlyAdCredits),
      auditor: String(auditor.monthlyAdCredits),
    },
    {
      label: "Storage limit",
      free: formatBytes(free.storageLimitBytes),
      plus: formatBytes(plus.storageLimitBytes),
      biz: formatBytes(biz.storageLimitBytes),
      auditor: formatBytes(auditor.storageLimitBytes),
    },
    {
      label: "Assign group moderators",
      free: yesNo(free.canAssignGroupModerators),
      plus: yesNo(plus.canAssignGroupModerators),
      biz: yesNo(biz.canAssignGroupModerators),
      auditor: yesNo(auditor.canAssignGroupModerators),
    },
    {
      label: "Site moderator eligibility",
      free: yesNo(free.canBeSiteModerator),
      plus: yesNo(plus.canBeSiteModerator),
      biz: yesNo(biz.canBeSiteModerator),
      auditor: yesNo(auditor.canBeSiteModerator),
    },
    {
      label: "Invite rules",
      free: "Separate invite rules",
      plus: "Separate invite rules",
      pro: "Separate invite rules",
      auditor: "Separate invite rules",
    },
  ];

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div className="space-y-2">
          <div className="inline-flex rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
            Membership
          </div>
          <h1 className="text-2xl font-semibold text-[var(--text-strong)]">Compare Free, Activist, Biz, and Auditor</h1>
          <p className="max-w-3xl text-sm text-slate-300">
            Free is for browsing, joining, and messaging. Activist adds core creation tools like events, listings, and fund raisers. Biz adds ads, hiring posts, and business workflows. Auditor is a qualified Biz-like tier with boosted ad credits. Admin is a separate role and is not a paid tier.
          </p>
        </div>

        <div className="rounded border border-amber-400/30 bg-amber-300/10 p-3 text-sm text-amber-100">
          Admin is separate from paid membership. Invites are governed by account rules and admin approval, not by tier alone.
        </div>

        <div className="overflow-x-auto rounded border border-[var(--border)]">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-black/10 text-[var(--text-strong)]">
              <tr>
                <th className="border-b border-[var(--border)] px-3 py-2">Feature</th>
                <th className="border-b border-[var(--border)] px-3 py-2">Free</th>
                <th className="border-b border-[var(--border)] px-3 py-2">Activist</th>
                <th className="border-b border-[var(--border)] px-3 py-2">Biz</th>
                <th className="border-b border-[var(--border)] px-3 py-2">Auditor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="odd:bg-black/5">
                  <td className="border-b border-[var(--border)] px-3 py-2 font-medium text-[var(--text-strong)]">{row.label}</td>
                  <td className="border-b border-[var(--border)] px-3 py-2 text-slate-200">
                    {row.label === "Create groups"
                      ? freeLabel(row.free, free.canCreateGroup)
                      : row.label === "Group member cap"
                        ? freeLabel(row.free, true)
                        : row.label === "Create events"
                          ? freeLabel(row.free, free.canCreateEvent)
                          : row.label === "Market listings"
                            ? freeLabel(row.free, free.canCreateBazaarListing)
                            : row.label === "Hiring posts"
                          ? freeLabel(row.free, free.canCreateHiringPost)
                          : row.label === "Fund raisers"
                            ? freeLabel(row.free, free.canCreateFundRaiser)
                          : row.label === "Change feed type"
                                ? freeLabel(row.free, free.canChangeFeedType)
                                : row.label === "Create ads"
                                  ? freeLabel(row.free, free.canCreateAds)
                                  : row.label === "Monthly ad credits"
                                    ? freeLabel(row.free, true)
                                    : row.label === "Storage limit"
                                      ? freeLabel(row.free, true)
                                      : row.label === "Assign group moderators"
                                        ? freeLabel(row.free, free.canAssignGroupModerators)
                                        : row.label === "Site moderator eligibility"
                                          ? freeLabel(row.free, free.canBeSiteModerator)
                                          : row.free}
                  </td>
                  <td className="border-b border-[var(--border)] px-3 py-2 text-slate-200">{row.plus}</td>
                  <td className="border-b border-[var(--border)] px-3 py-2 text-slate-200">{row.biz}</td>
                  <td className="border-b border-[var(--border)] px-3 py-2 text-slate-200">{row.auditor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded border border-[var(--border)] px-2 py-1 text-xs text-slate-300">
            Current plan: {currentPolicy.isAdmin ? "Admin" : getDisplayMembershipTierName(currentPolicy.tier)}
          </span>
          <Link href="/settings/subscription" className="rounded border border-amber-300/40 bg-[#8f7228] px-3 py-2 text-sm font-semibold text-black">
            Open subscription
          </Link>
          <Link href="/home" className="rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-strong)]">
            Back to stream
          </Link>
        </div>

        <p className="text-xs text-slate-400">Invite access is separate from paid plans. Moderator access and site moderator access depend on the policy and role rules already in place.</p>
      </section>
    </AppShell>
  );
}
