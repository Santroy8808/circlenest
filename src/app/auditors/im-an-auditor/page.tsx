import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { AuditorListingFormClient } from "@/components/auditors/auditor-listing-form-client";
import { parseScientologyChecklist } from "@/lib/profile/scientology";

export default async function ImAnAuditorPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [listing, scientologyProfile] = await Promise.all([
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

