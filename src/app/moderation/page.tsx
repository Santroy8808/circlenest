import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { prisma } from "@/lib/db/prisma";
import { ensureBootstrapAdmins, isAdminUser, isSiteModeratorUser, logAdminAction } from "@/lib/auth/admin";
import { hasFreshPrivilegedActionAccess, hasFreshSecureAreaAccess } from "@/lib/security/action-access";
import { requireAdminModePage } from "@/lib/security/admin-mode-guards";
import { requireSecureAreaPage } from "@/lib/security/secure-area-guards";
import { REPORT_REVIEW_STATUSES } from "@/lib/reports/report-types";

export default async function ModerationPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  await ensureBootstrapAdmins();

  const adminAccess = await isAdminUser(session.user.id);
  if (adminAccess) requireAdminModePage(session.user.id);
  const moderatorAccess = adminAccess || (await isSiteModeratorUser(session.user.id));
  if (!moderatorAccess) redirect("/home");
  requireSecureAreaPage(session.user.id, "/moderation");

  const [logs, petitions, reports] = await Promise.all([
    prisma.moderatorActionLog.findMany({
      include: { actor: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    adminAccess
      ? prisma.adminPetition.findMany({
          include: { requester: { select: { username: true, email: true } } },
          orderBy: { createdAt: "desc" },
          take: 10,
        })
      : Promise.resolve([]),
    prisma.contentReport.findMany({
      where: {
        status: { in: [...REPORT_REVIEW_STATUSES] },
      },
      include: {
        reporter: { select: { username: true, email: true } },
        assignedModerator: { select: { username: true, email: true } },
        reviewedBy: { select: { username: true, email: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100,
    }),
  ]);

  return (
    <AppShell>
      <section className="card space-y-5 p-4">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">{adminAccess ? "Moderator Dashboard" : "Moderator Dashboard"}</h1>
          <p className="text-sm text-slate-500">
            {adminAccess
              ? "Admin and site-moderator tools are separated here."
              : "Site moderators can review activity and jump to moderation actions here."}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <QuickLink label="Group moderation" href="/groups" description="Approve joins, assign roles, and manage members." />
          <QuickLink label="Event moderation" href="/events" description="Review and manage event permissions." />
          <QuickLink label="Audit log" href="#audit" description="Recent moderation actions and history." />
        </div>

        <section id="reports" className="space-y-3 rounded border border-[var(--border)] p-3">
          <div>
            <h2 className="text-lg font-semibold">Content review queue</h2>
            <p className="text-xs text-slate-500">Review reports, update status, and add resolution notes.</p>
          </div>

          <div className="grid gap-2 md:grid-cols-4">
            {REPORT_REVIEW_STATUSES.map((status) => {
              const count = reports.filter((report) => report.status === status).length;
              return (
                <div key={status} className="rounded border border-[var(--border)] p-3">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{status}</p>
                  <p className="text-lg font-semibold">{count}</p>
                </div>
              );
            })}
          </div>

          <div className="space-y-3">
            {reports.map((report) => (
              <article key={report.id} className="rounded border border-[var(--border)] p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {report.targetType} • {report.reason}
                    </p>
                    <p className="text-xs text-slate-500">
                      target {report.targetId} • #{report.id}
                    </p>
                  </div>
                  <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-300">
                    {report.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Reported by @{report.reporter.username} ({report.reporter.email}) on {new Date(report.createdAt).toLocaleString()}
                </p>
                {report.details ? <p className="mt-2 text-xs text-slate-300">{report.details}</p> : null}
                <p className="mt-1 text-xs text-slate-500">
                  Assigned: {report.assignedModerator ? `@${report.assignedModerator.username}` : "Unassigned"}
                  {report.reviewedBy ? ` | Reviewed by @${report.reviewedBy.username}` : ""}
                </p>
                {report.resolution ? <p className="mt-1 text-xs text-slate-300">Resolution: {report.resolution}</p> : null}
                <form
                  action={async (formData) => {
                    "use server";
                    const { auth } = await import("@/auth");
                    const { prisma } = await import("@/lib/db/prisma");
                    const { ensureBootstrapAdmins, isAdminUser, isSiteModeratorUser, logAdminAction } = await import("@/lib/auth/admin");
                    const { revalidatePath } = await import("next/cache");
                    const current = await auth();
                    if (!current?.user?.id) return;
                    await ensureBootstrapAdmins();
                    const admin = await isAdminUser(current.user.id);
                    const moderator = admin || (await isSiteModeratorUser(current.user.id));
                    if (!moderator) return;
                    if (admin) {
                      if (!hasFreshPrivilegedActionAccess(current.user.id)) return;
                    } else if (!hasFreshSecureAreaAccess(current.user.id)) {
                      return;
                    }

                    const reportId = String(formData.get("reportId") ?? "").trim();
                    const nextStatus = String(formData.get("status") ?? "").trim().toUpperCase();
                    const resolution = String(formData.get("resolution") ?? "").trim() || null;
                    if (!reportId || !REPORT_REVIEW_STATUSES.includes(nextStatus as (typeof REPORT_REVIEW_STATUSES)[number])) return;

                    const existing = await prisma.contentReport.findUnique({
                      where: { id: reportId },
                      select: { id: true, targetType: true, targetId: true, assignedModeratorId: true },
                    });
                    if (!existing) return;

                    const updateData: {
                      status: string;
                      resolution?: string | null;
                      assignedModeratorId?: string | null;
                      assignedAt?: Date | null;
                      reviewedById?: string | null;
                      reviewedAt?: Date | null;
                    } = {
                      status: nextStatus,
                      resolution,
                    };

                    if (nextStatus === "REVIEWING") {
                      updateData.assignedModeratorId = current.user.id;
                      updateData.assignedAt = new Date();
                    }

                    if (nextStatus === "RESOLVED" || nextStatus === "DISMISSED") {
                      updateData.reviewedById = current.user.id;
                      updateData.reviewedAt = new Date();
                    }

                    await prisma.contentReport.update({
                      where: { id: reportId },
                      data: updateData,
                    });

                    await logAdminAction({
                      actorUserId: current.user.id,
                      action:
                        nextStatus === "REVIEWING"
                          ? "CONTENT_REPORT_REVIEWING"
                          : nextStatus === "RESOLVED"
                            ? "CONTENT_REPORT_RESOLVED"
                            : nextStatus === "DISMISSED"
                              ? "CONTENT_REPORT_DISMISSED"
                              : "CONTENT_REPORT_OPEN",
                      targetType: "CONTENT_REPORT",
                      targetId: reportId,
                      note: resolution || `${existing.targetType} | ${existing.targetId}`,
                    });
                    revalidatePath("/moderation");
                  }}
                  className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]"
                >
                  <input type="hidden" name="reportId" value={report.id} />
                  <select name="status" defaultValue={report.status} className="rounded border border-slate-300 px-3 py-2 text-sm">
                    {REPORT_REVIEW_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <input
                    name="resolution"
                    defaultValue={report.resolution ?? ""}
                    placeholder="Resolution notes"
                    className="rounded border border-slate-300 px-3 py-2 text-sm"
                  />
                  <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-sm text-white md:col-start-3">
                    Save review
                  </button>
                </form>
              </article>
            ))}
            {reports.length === 0 ? <p className="text-sm text-slate-500">No reports yet.</p> : null}
          </div>
        </section>

        {adminAccess ? (
          <section className="rounded border border-[var(--border)] p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Admin-only controls</h2>
                <p className="text-xs text-slate-500">Site moderators do not see these controls.</p>
              </div>
              <Link href="/admin" className="rounded border border-slate-300 px-3 py-2 text-sm">
                Open Admin Portal
              </Link>
            </div>
            <div className="mt-3 grid gap-2 text-sm text-slate-300 md:grid-cols-2">
              <Link href="/admin#site-moderators" className="rounded border border-[var(--border)] p-3 hover:bg-white/5">
                Manage site moderators
              </Link>
              <Link href="/admin#member-tiers" className="rounded border border-[var(--border)] p-3 hover:bg-white/5">
                Member tier management
              </Link>
            </div>
          </section>
        ) : null}

        {adminAccess && petitions.length > 0 ? (
          <section className="rounded border border-[var(--border)] p-3">
            <h2 className="mb-3 text-lg font-semibold">Open petitions</h2>
            <div className="grid gap-2">
              {petitions.map((petition) => (
                <article key={petition.id} className="rounded border border-[var(--border)] p-3 text-sm">
                  <p className="font-medium">{petition.subject}</p>
                  <p className="text-xs text-slate-500">
                    @{petition.requester.username} | {petition.requester.email} | {petition.status}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section id="audit" className="space-y-2">
          <h2 className="text-lg font-semibold">Recent moderation actions</h2>
          <div className="grid gap-2">
            {logs.map((log) => (
              <article key={log.id} className="rounded border border-[var(--border)] p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{log.action}</p>
                  <p className="text-xs text-slate-500">{new Date(log.createdAt).toLocaleString()}</p>
                </div>
                <p className="text-xs text-slate-500">
                  {log.targetType} | {log.targetId} | by @{log.actor.username}
                </p>
                {log.note ? <p className="text-xs text-slate-400">{log.note}</p> : null}
              </article>
            ))}
            {logs.length === 0 ? <p className="text-sm text-slate-500">No moderation actions yet.</p> : null}
          </div>
        </section>
      </section>
    </AppShell>
  );
}

function QuickLink({ label, href, description }: { label: string; href: string; description: string }) {
  return (
    <Link href={href} className="rounded border border-[var(--border)] p-3 transition hover:bg-white/5">
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
    </Link>
  );
}
