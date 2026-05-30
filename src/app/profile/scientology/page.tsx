import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { ScientologyProfileClient } from "@/components/profile/scientology-profile-client";
import { SecureAreaSessionClient } from "@/components/security/secure-area-session-client";
import { prisma } from "@/lib/db/prisma";
import { parseScientologyChecklist } from "@/lib/profile/scientology";
import { requireSecureAreaPage } from "@/lib/security/secure-area-guards";

export default async function ProfileScientologyPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  requireSecureAreaPage(session.user.id, "/profile/scientology");

  const profile = await prisma.profile.findUnique({
    where: { userId: session.user.id },
    select: {
      scientologyTrainingLevel: true,
      scientologyCaseLevel: true,
      scientologyAdditionalCoursesJson: true,
      scientologyIncludeOnResume: true,
      scientologyVisible: true,
    },
  });

  return (
    <AppShell>
      <SecureAreaSessionClient />
      <ScientologyProfileClient
        initial={{
          trainingLevel: profile?.scientologyTrainingLevel ?? "",
          processingLevel: profile?.scientologyCaseLevel ?? "",
          additionalCourses: parseScientologyChecklist(profile?.scientologyAdditionalCoursesJson),
          visible: profile?.scientologyVisible ?? false,
          includeOnResume: profile?.scientologyIncludeOnResume ?? false,
        }}
      />
    </AppShell>
  );
}
