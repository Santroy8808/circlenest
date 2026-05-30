import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { ResumeBuilderClient } from "@/components/profile/resume-builder-client";
import { SecureAreaSessionClient } from "@/components/security/secure-area-session-client";
import { prisma } from "@/lib/db/prisma";
import { parseResumeJson } from "@/lib/profile/resume";
import { requireSecureAreaPage } from "@/lib/security/secure-area-guards";

export default async function ProfileResumePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  requireSecureAreaPage(session.user.id, "/profile/resume");

  const profile = await prisma.profile.findUnique({
    where: { userId: session.user.id },
    select: { resumeJson: true, resumeVisible: true },
  });

  return (
    <AppShell>
      <SecureAreaSessionClient />
      <ResumeBuilderClient
        initial={{
          data: parseResumeJson(profile?.resumeJson),
          visible: profile?.resumeVisible ?? false,
        }}
      />
    </AppShell>
  );
}
