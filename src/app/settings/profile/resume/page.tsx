import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ResumeForm } from "@/components/profile/resume-form";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { getResumeForOwner } from "@/modules/profile-resume/profile-resume.service";

export default async function ResumeSettingsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/settings/profile/resume");
  }

  const actor = await getActiveAccountActor(session.user.id);
  const resume = await getResumeForOwner(actor.actorUserId);

  return (
    <AppShell>
      <ResumeForm initialResume={resume} />
    </AppShell>
  );
}
