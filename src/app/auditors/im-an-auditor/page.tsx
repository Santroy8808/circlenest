import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuditorProfileForm } from "@/components/auditors/auditor-profile-form";
import { AppShell } from "@/components/platform/app-shell";
import { getMyAuditorProfile } from "@/modules/auditors/auditors.service";
import { resolveMembershipRouteAccess } from "@/modules/membership-policy/route-access";

export default async function ImAnAuditorPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/auditors/im-an-auditor");
  }

  const access = await resolveMembershipRouteAccess(session.user.id, "auditorProfileCreate", "page");
  if (!access.allowed) notFound();

  const result = await getMyAuditorProfile(session.user.id);

  return (
    <AppShell>
      <AuditorProfileForm data={result} />
    </AppShell>
  );
}
