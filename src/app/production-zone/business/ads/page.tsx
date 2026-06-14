import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdCampaignManager } from "@/components/ads/ad-campaign-manager";
import { AppShell } from "@/components/layout/app-shell";
import { getProAdCreditBalance } from "@/lib/ads/ads";
import { canCreateAdCampaign, serializeAdCampaigns } from "@/lib/ads/campaigns";
import { serializeBusinessProfile } from "@/lib/business/business-profile";
import { prisma } from "@/lib/db/prisma";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";

export default async function BusinessAdsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [user, businessProfile, campaigns] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, subscriptionTier: true },
    }),
    prisma.businessProfile.findUnique({
      where: { ownerId: session.user.id },
      include: {
        owner: { select: { id: true, username: true, fullName: true } },
        complianceProfile: {
          select: { processorOnboardingStatus: true, processorChargesEnabled: true, processorPayoutsEnabled: true },
        },
      },
    }),
    prisma.adCampaign.findMany({
      where: { creatorId: session.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        businessProfile: { select: { id: true, businessName: true, storefrontSlug: true } },
        landingArticle: { select: { id: true, title: true, body: true, heroImageUrl: true, ctaLabel: true, ctaUrl: true, status: true } },
        _count: { select: { impressions: true, clicks: true, engagements: true } },
      },
    }),
  ]);

  const policy = resolveMemberAccessPolicy(session.user.id, user);
  if (!(policy.tier === "PRO" || policy.tier === "AUDITOR" || policy.isAdmin)) redirect("/production-zone");

  const businessSummary = businessProfile ? serializeBusinessProfile(businessProfile) : null;
  const profileReady = policy.isAdmin || policy.tier === "AUDITOR" || Boolean(businessSummary?.completion.reviewReady);
  const creditBalance = await getProAdCreditBalance(session.user.id, policy);

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-strong)]">Ads and campaigns</h1>
          <p className="text-sm text-slate-400">
            Create platform ad campaigns with a target, landing article, duration, and privacy-safe performance tracking.
          </p>
        </div>
        <AdCampaignManager
          campaigns={serializeAdCampaigns(campaigns)}
          canCreate={canCreateAdCampaign(policy)}
          profileReady={profileReady}
          creditBalance={creditBalance}
        />
      </section>
    </AppShell>
  );
}
