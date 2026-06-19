import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { ProfileInterestsForm } from "@/components/profile/profile-interests-form";
import { getProfileInterests } from "@/modules/profile-identity/profile-interests.service";

export default async function ProfileInterestsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/profile/interests");
  }

  const interests = await getProfileInterests(session.user.id);

  return (
    <AppShell>
      <ProfileInterestsForm initialCategories={interests.map((interest) => interest.category)} />
    </AppShell>
  );
}
