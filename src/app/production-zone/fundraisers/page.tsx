import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { prisma } from "@/lib/db/prisma";
import { canCreateFundRaiser } from "@/lib/policy/tier-policy";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";

export default async function ProductionZoneFundraisersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, subscriptionTier: true },
  });
  const policy = resolveMemberAccessPolicy(session.user.id, user);
  if (policy.tier === "FREE") {
    redirect("/production-zone");
  }
  const canCreate = canCreateFundRaiser(policy);

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div>
          <h1 className="text-xl font-semibold">Production Zone: Fund Raiser</h1>
          <p className="text-sm text-slate-400">Browse campaigns, then open the fundraiser creator if your tier supports it.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <article className="rounded border border-[var(--border)] p-4">
            <h2 className="text-base font-semibold text-[var(--text-strong)]">View fund raisers</h2>
            <p className="mt-1 text-sm text-slate-400">Browse all current campaigns and their discussions.</p>
            <Link href="/fundraisers" className="mt-3 inline-flex rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-strong)]">
              Open fund raisers
            </Link>
          </article>
          <article className="rounded border border-[var(--border)] p-4">
            <h2 className="text-base font-semibold text-[var(--text-strong)]">Create a fund raiser</h2>
            <p className="mt-1 text-sm text-slate-400">
              {canCreate ? "Your tier can create a fund raiser on the main fundraiser page." : "Your tier cannot create a fund raiser yet."}
            </p>
            <Link href={canCreate ? "/fundraisers" : "/settings/subscription"} className="mt-3 inline-flex rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-strong)]">
              {canCreate ? "Open fundraiser creator" : "Open subscription"}
            </Link>
          </article>
        </div>
      </section>
    </AppShell>
  );
}
