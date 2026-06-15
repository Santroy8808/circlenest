import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { AuditorListingFormClient } from "@/components/auditors/auditor-listing-form-client";
import { parseScientologyChecklist } from "@/lib/profile/scientology";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";

export default async function ImAnAuditorPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [user, listing, scientologyProfile] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, subscriptionTier: true },
    }),
    prisma.auditorListing.findUnique({
      where: { userId: session.user.id },
      include: { media: true },
    }),
    prisma.profile.findUnique({
      where: { userId: session.user.id },
      select: {
        displayName: true,
        scientologyTrainingLevel: true,
        scientologyCaseLevel: true,
        scientologyAdditionalCoursesJson: true,
      },
    }),
  ]);
  const policy = resolveMemberAccessPolicy(session.user.id, user);
  if (policy.tier !== "AUDITOR") redirect("/production-zone/auditors");

  return (
    <AppShell>
      <AuditorListingFormClient
        initialListing={listing}
        scientologySource={{
          displayName: scientologyProfile?.displayName ?? null,
          trainingLevel: scientologyProfile?.scientologyTrainingLevel ?? "",
          processingLevel: scientologyProfile?.scientologyCaseLevel ?? "",
          additionalCourses: parseScientologyChecklist(scientologyProfile?.scientologyAdditionalCoursesJson),
        }}
      />
    </AppShell>
  );
}

