import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { EditProfileClient } from "@/components/profile/edit-profile-client";
import { SecureAreaSessionClient } from "@/components/security/secure-area-session-client";
import { prisma } from "@/lib/db/prisma";
import { requireSecureAreaPage } from "@/lib/security/secure-area-guards";

export default async function EditProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  requireSecureAreaPage(session.user.id, "/profile/edit");
  const [profile, user] = await Promise.all([
    prisma.profile.findUnique({ where: { userId: session.user.id } }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { backupEmail: true } }),
  ]);

  return (
    <AppShell>
      <SecureAreaSessionClient />
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
