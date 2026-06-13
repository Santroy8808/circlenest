import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { prisma } from "@/lib/db/prisma";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";

export default async function ProductionZoneWritersCornerPage() {
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

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div>
          <h1 className="text-xl font-semibold">Production Zone: Writers Corner</h1>
          <p className="text-sm text-slate-400">Open your manuscripts and drill down into chapters from the writing workspace.</p>
        </div>
        <Link
          href="/production-zone/writers-studio"
          className="block rounded border border-[var(--border)] p-4 transition hover:border-[var(--accent)]/40 hover:bg-[color:var(--card-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
        >
          <h2 className="text-base font-semibold text-[var(--text-strong)]">Manuscripts</h2>
          <p className="mt-1 text-sm text-slate-400">Open the manuscript list, then tap a manuscript card to create chapters or read the chapter pages.</p>
        </Link>
      </section>
    </AppShell>
  );
}
