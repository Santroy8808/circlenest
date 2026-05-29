import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { ScientologyProfileClient } from "@/components/profile/scientology-profile-client";
import { prisma } from "@/lib/db/prisma";

export default async function ProfileScientologyPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const profile = await prisma.profile.findUnique({
    where: { userId: session.user.id },
    select: {
      scientologyTrainingLevel: true,
      scientologyCaseLevel: true,
      scientologySuccessStory: true,
      scientologyAchievements: true,
      scientologyGoals: true,
      scientologyProjects: true,
      scientologyVisible: true,
    },
  });

  return (
    <AppShell>
      <ScientologyProfileClient
        initial={{
          trainingLevel: profile?.scientologyTrainingLevel ?? "",
          caseLevel: profile?.scientologyCaseLevel ?? "",
          successStory: profile?.scientologySuccessStory ?? "",
          achievements: profile?.scientologyAchievements ?? "",
          goals: profile?.scientologyGoals ?? "",
          projects: profile?.scientologyProjects ?? "",
          visible: profile?.scientologyVisible ?? false,
        }}
      />
    </AppShell>
  );
}

