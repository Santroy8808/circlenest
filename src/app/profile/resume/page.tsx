import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { ResumeBuilderClient } from "@/components/profile/resume-builder-client";
import { prisma } from "@/lib/db/prisma";
import { parseResumeJson } from "@/lib/profile/resume";

export default async function ProfileResumePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const profile = await prisma.profile.findUnique({
    where: { userId: session.user.id },
    select: { resumeJson: true, resumeVisible: true },
  });

  return (
    <AppShell>
      <ResumeBuilderClient
        initial={{
          data: parseResumeJson(profile?.resumeJson),
          visible: profile?.resumeVisible ?? false,
        }}
      />
    </AppShell>
  );
}

