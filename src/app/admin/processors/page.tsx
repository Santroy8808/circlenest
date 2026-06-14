import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PaymentProcessorConsole } from "@/components/admin/payment-processor-console";
import { AppShell } from "@/components/layout/app-shell";
import { ensureBootstrapAdmins, isAdminUser } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { seedDefaultStripeProcessorConfigs, serializePaymentProcessorConfig } from "@/lib/payments/processor-config";
import { hasFreshAdminModeAccess, hasFreshSecureAreaAccess } from "@/lib/security/action-access";

export default async function AdminProcessorsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  await ensureBootstrapAdmins();
  if (!(await isAdminUser(session.user.id))) redirect("/home");
  if (!hasFreshAdminModeAccess(session.user.id) || !hasFreshSecureAreaAccess(session.user.id)) {
    redirect(`/secure-area?next=${encodeURIComponent("/admin/processors")}&reason=locked`);
  }

  await seedDefaultStripeProcessorConfigs(session.user.id);
  const configs = await prisma.paymentProcessorConfig.findMany({
    orderBy: [{ provider: "asc" }, { area: "asc" }, { mode: "asc" }],
    include: {
      updatedBy: { select: { id: true, username: true, email: true } },
      webhookEvents: { orderBy: { receivedAt: "desc" }, take: 5 },
    },
  });

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-strong)]">Payment processor configuration</h1>
          <p className="text-sm text-slate-400">
            Stripe-ready configuration for subscriptions, market, fundraisers, events, onboarding, withdrawals, and platform fees.
          </p>
        </div>
        <PaymentProcessorConsole configs={configs.map(serializePaymentProcessorConfig)} />
      </section>
    </AppShell>
  );
}
