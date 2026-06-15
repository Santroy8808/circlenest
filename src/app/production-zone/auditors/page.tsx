import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { prisma } from "@/lib/db/prisma";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";

export default async function ProductionZoneAuditorsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, subscriptionTier: true },
  });
  const policy = resolveMemberAccessPolicy(session.user.id, user);
  const hasAuditorAccount = policy.tier === "AUDITOR";

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div>
          <h1 className="text-xl font-semibold">Production Zone: Find an Auditor</h1>
          <p className="text-sm text-slate-400">Use the directory to search, filter, and open auditor listings.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Link
            href="/auditors"
            className="block rounded border border-[var(--border)] p-4 transition hover:border-[var(--accent)]/40 hover:bg-[color:var(--card-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
          >
            <h2 className="text-base font-semibold text-[var(--text-strong)]">View auditor listings</h2>
            <p className="mt-1 text-sm text-slate-400">Browse the public directory and filter auditors by details that matter to you.</p>
          </Link>
          {hasAuditorAccount ? (
            <Link
              href="/auditors/im-an-auditor"
              className="block rounded border border-[var(--border)] p-4 transition hover:border-[var(--accent)]/40 hover:bg-[color:var(--card-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
            >
              <h2 className="text-base font-semibold text-[var(--text-strong)]">I&apos;m an Auditor</h2>
              <p className="mt-1 text-sm text-slate-400">Maintain your own auditor profile from its dedicated page.</p>
            </Link>
          ) : (
            <div className="rounded border border-[var(--border)] p-4">
              <h2 className="text-base font-semibold text-[var(--text-strong)]">I&apos;m an Auditor</h2>
              <p className="mt-1 text-sm text-slate-400">Only Auditor accounts can create or maintain an auditor profile.</p>
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
