import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { ADMIN_ACTIONS, adminActionCategories } from "@/lib/admin/admin-action-catalog";
import { ensureBootstrapAdmins, isAdminUser } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { requireAdminModePage } from "@/lib/security/admin-mode-guards";
import { requireSecureAreaPage } from "@/lib/security/secure-area-guards";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  await ensureBootstrapAdmins();

  if (!(await isAdminUser(session.user.id))) {
    return (
      <AppShell>
        <section className="card space-y-3 p-4">
          <h1 className="text-xl font-semibold">Admin Portal</h1>
          <p className="text-sm text-slate-500">Admin access only.</p>
          <Link href="/home" className="inline-flex rounded border border-slate-300 px-3 py-2 text-sm">
            Back to Home
          </Link>
        </section>
      </AppShell>
    );
  }

  requireAdminModePage(session.user.id);
  requireSecureAreaPage(session.user.id, "/admin");

  const [userCount, openReportCount, businessReviewCount, featureFlagCount, auditCount] = await Promise.all([
    prisma.user.count(),
    prisma.contentReport.count({ where: { status: { in: ["OPEN", "PENDING", "ASSIGNED"] } } }),
    prisma.businessProfile.count({ where: { OR: [{ verificationStatus: "PENDING" }, { status: "HOLD" }] } }),
    prisma.platformFeatureFlag.count(),
    prisma.moderatorActionLog.count(),
  ]);

  const stats = [
    { label: "Users", value: userCount },
    { label: "Open reports", value: openReportCount },
    { label: "Business reviews", value: businessReviewCount },
    { label: "Feature flags", value: featureFlagCount },
    { label: "Audit rows", value: auditCount },
  ];

  return (
    <AppShell>
      <section className="card space-y-6 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f0d878]">Administrator mode</p>
            <h1 className="text-2xl font-semibold text-[var(--text-strong)]">Admin Portal</h1>
            <p className="text-sm text-slate-400">
              Choose one administrative action. Each card opens a guided walkthrough with safety notes, required inputs, and an audit trail.
            </p>
          </div>
          <Link
            href="/admin/console"
            className="rounded-full border border-[#52647f] px-4 py-2 text-sm font-semibold text-slate-100 transition hover:-translate-y-0.5 hover:border-[#f0d878]"
          >
            Open advanced console
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-[#304058] bg-[#0d1626] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#f0d878]">{stat.label}</p>
              <p className="mt-1 text-xl font-semibold text-slate-100">{stat.value}</p>
            </div>
          ))}
        </div>

        <section className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4">
          <h2 className="text-lg font-semibold text-amber-100">Admin safety boundary</h2>
          <p className="mt-1 text-sm text-amber-100/90">
            Admins can control privileges, safety, moderation, platform credits, review workflows, and visibility tools. Admins cannot create real money,
            edit processor secrets, or delete preserved audit and ledger records.
          </p>
        </section>

        <div className="space-y-6">
          {adminActionCategories().map((category) => (
            <section key={category} className="space-y-3">
              <h2 className="text-lg font-semibold text-[#f0d878]">{category}</h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {ADMIN_ACTIONS.filter((action) => action.category === category).map((action) => (
                  <Link
                    key={action.id}
                    href={action.id === "processor-config" ? "/admin/processors" : `/admin/actions/${action.id}`}
                    className="group min-h-[190px] rounded-2xl border border-[#304058] bg-[#101a2c] p-4 transition hover:-translate-y-0.5 hover:border-[#f0d878]/70 hover:bg-[#142035]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-lg font-semibold text-[var(--text-strong)] group-hover:text-[#f0d878]">{action.title}</h3>
                      <span className="rounded-full border border-[#52647f] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                        {action.risk}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-400">{action.summary}</p>
                    <p className="mt-4 text-xs text-slate-500">{action.outcome}</p>
                    <div className="mt-4 flex items-center justify-between text-xs">
                      <span className="text-slate-500">{action.time}</span>
                      <span className="font-semibold text-[#f0d878]">Start wizard</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
