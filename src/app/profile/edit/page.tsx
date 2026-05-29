import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { EditProfileClient } from "@/components/profile/edit-profile-client";
import { prisma } from "@/lib/db/prisma";

export default async function EditProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const [profile, user] = await Promise.all([
    prisma.profile.findUnique({ where: { userId: session.user.id } }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { backupEmail: true } }),
  ]);

  return (
    <AppShell>
      <EditProfileClient
        initial={{
          displayName: profile?.displayName ?? "",
          headline: profile?.headline ?? "",
          bio: profile?.bio ?? "",
          location: profile?.location ?? "",
          backupEmail: user?.backupEmail ?? "",
          interests: profile?.interests ?? "",
          relationshipStatus: profile?.relationshipStatus ?? "",
          detailedBioJson: profile?.detailedBioJson ?? "",
        }}
      />
    </AppShell>
  );
}
