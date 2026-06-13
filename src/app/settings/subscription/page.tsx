import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { SecureAreaSessionClient } from "@/components/security/secure-area-session-client";
import { BillingSettings } from "@/components/settings/billing-settings";
import { prisma } from "@/lib/db/prisma";
import { requireSecureAreaPage } from "@/lib/security/secure-area-guards";

export default async function SettingsSubscriptionPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  requireSecureAreaPage(session.user.id, "/settings/subscription");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true,
      subscriptionTier: true,
      billingSubscription: {
        select: {
          provider: true,
          providerCustomerId: true,
          providerSubscriptionId: true,
          subscriptionTier: true,
          status: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          canceledAt: true,
          trialEndsAt: true,
          pausedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  return (
    <AppShell>
      <SecureAreaSessionClient />
      <section className="card p-4">
        <BillingSettings
          role={user?.role ?? "MEMBER"}
          subscriptionTier={user?.subscriptionTier ?? "FREE"}
          billingSubscription={
            user?.billingSubscription
              ? {
                  provider: user.billingSubscription.provider,
                  providerCustomerId: user.billingSubscription.providerCustomerId,
                  providerSubscriptionId: user.billingSubscription.providerSubscriptionId,
                  subscriptionTier: user.billingSubscription.subscriptionTier,
                  status: user.billingSubscription.status,
                  currentPeriodStart: user.billingSubscription.currentPeriodStart?.toISOString() ?? null,
                  currentPeriodEnd: user.billingSubscription.currentPeriodEnd?.toISOString() ?? null,
                  cancelAtPeriodEnd: user.billingSubscription.cancelAtPeriodEnd,
                  canceledAt: user.billingSubscription.canceledAt?.toISOString() ?? null,
                  trialEndsAt: user.billingSubscription.trialEndsAt?.toISOString() ?? null,
                  pausedAt: user.billingSubscription.pausedAt?.toISOString() ?? null,
                  createdAt: user.billingSubscription.createdAt.toISOString(),
                  updatedAt: user.billingSubscription.updatedAt.toISOString(),
                }
              : null
          }
        />
      </section>
    </AppShell>
  );
}
