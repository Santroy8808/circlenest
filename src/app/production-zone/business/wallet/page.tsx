import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { WalletManager } from "@/components/funds/wallet-manager";
import { AppShell } from "@/components/layout/app-shell";
import { prisma } from "@/lib/db/prisma";
import { getWalletSummary } from "@/lib/funds/ledger";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";

export default async function BusinessWalletPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, subscriptionTier: true },
  });
  const policy = resolveMemberAccessPolicy(session.user.id, user);
  if (!(policy.tier === "PRO" || policy.tier === "AUDITOR" || policy.isAdmin)) redirect("/production-zone");

  const [wallet, withdrawals] = await Promise.all([
    getWalletSummary(session.user.id),
    prisma.withdrawalRequest.findMany({
      where: { userId: session.user.id },
      orderBy: { requestedAt: "desc" },
      take: 25,
      include: { batch: { select: { batchKey: true, scheduledFor: true, status: true } } },
    }),
  ]);

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-strong)]">Business wallet</h1>
          <p className="text-sm text-slate-400">
            Real funds, platform credits, and withdrawals stay separated. Real-money deposits must come from payment processor events.
          </p>
        </div>
        <WalletManager
          wallet={wallet}
          withdrawals={withdrawals.map((withdrawal) => ({
            id: withdrawal.id,
            amountCents: withdrawal.amountCents,
            currency: withdrawal.currency,
            status: withdrawal.status,
            requestedAt: withdrawal.requestedAt.toISOString(),
            batch: withdrawal.batch
              ? {
                  batchKey: withdrawal.batch.batchKey,
                  scheduledFor: withdrawal.batch.scheduledFor.toISOString(),
                  status: withdrawal.batch.status,
                }
              : null,
          }))}
        />
      </section>
    </AppShell>
  );
}
