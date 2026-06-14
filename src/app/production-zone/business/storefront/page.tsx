import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { prisma } from "@/lib/db/prisma";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";
import { BusinessStorefrontManager } from "@/components/business/business-storefront-manager";
import { serializeBusinessProfile } from "@/lib/business/business-profile";
import { serializeBusinessStorefrontInquiries } from "@/lib/business/storefront";

export default async function ProductionZoneBusinessStorefrontPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, subscriptionTier: true },
  });
  const policy = resolveMemberAccessPolicy(session.user.id, user);
  if (!(policy.tier === "PRO" || policy.isAdmin)) {
    redirect("/production-zone");
  }

  const ownProfile = await prisma.businessProfile.findUnique({
    where: { ownerId: session.user.id },
    include: {
      owner: { select: { id: true, username: true, fullName: true } },
      complianceProfile: {
        select: { processorOnboardingStatus: true, processorChargesEnabled: true, processorPayoutsEnabled: true },
      },
    },
  });
  const inquiries = ownProfile
    ? await prisma.businessStorefrontInquiry.findMany({
        where: { businessProfileId: ownProfile.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      })
    : [];

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div>
          <h1 className="text-xl font-semibold">Production Zone: Storefront</h1>
          <p className="text-sm text-slate-400">Create a public storefront that non-members can see and contact.</p>
        </div>

        <BusinessStorefrontManager
          ownProfile={ownProfile ? serializeBusinessProfile(ownProfile) : null}
          inquiries={serializeBusinessStorefrontInquiries(inquiries)}
        />
      </section>
    </AppShell>
  );
}
