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
        <div className="rounded border border-[var(--border)] p-4">
          <h2 className="text-base font-semibold text-[var(--text-strong)]">Manuscripts</h2>
          <p className="mt-1 text-sm text-slate-400">Use the dedicated writing workspace to create or edit manuscripts and chapters.</p>
          <Link href="/production-zone/writers-studio" className="mt-3 inline-flex rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-strong)]">
            Open Writers Corner
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
