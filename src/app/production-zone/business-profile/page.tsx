import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { isAdminUser } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { BusinessProfileManager } from "@/components/business/business-profile-manager";
import { canCreateBusinessProfile, resolveProductionZoneAccess } from "@/lib/policy/production-zone";
import { serializeBusinessProfiles, serializeBusinessProfile } from "@/lib/business/business-profile";

export default async function BusinessProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { subscriptionTier: true, iasStatus: true },
  });
  const isAdmin = await isAdminUser(session.user.id);
  const isInvitedCreator = Boolean(user?.iasStatus && user.iasStatus.toUpperCase() === "INVITED_CREATOR");
  const access = resolveProductionZoneAccess(user?.subscriptionTier, isInvitedCreator);
  const canCreate = isAdmin || canCreateBusinessProfile(user?.subscriptionTier, isInvitedCreator);

  const [ownProfile, publicProfiles] = await Promise.all([
    prisma.businessProfile.findUnique({
      where: { ownerId: session.user.id },
      include: { owner: { select: { id: true, username: true, fullName: true } } },
    }),
    prisma.businessProfile.findMany({
      where: { isPublic: true, NOT: { ownerId: session.user.id } },
      include: { owner: { select: { id: true, username: true, fullName: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div>
          <h1 className="text-xl font-semibold">Business Profile</h1>
          <p className="text-sm text-slate-500">
            Browse public business profiles. Storefront publishing now lives on the separate{" "}
            <Link href="/production-zone/business/storefront" className="underline">
              Storefront
            </Link>{" "}
            page. Creation is invite-only and subscription-gated.
          </p>
        </div>
        {!canCreate ? (
          <p className="rounded border border-amber-400/30 bg-amber-400/10 p-2 text-sm text-amber-200">{access.reason ?? "Business profile creation is locked."}</p>
        ) : null}
        <BusinessProfileManager
          canCreate={canCreate}
          accessReason={access.reason ?? null}
          ownProfile={ownProfile ? serializeBusinessProfile(ownProfile) : null}
          publicProfiles={serializeBusinessProfiles(publicProfiles)}
        />
      </section>
    </AppShell>
  );
}
