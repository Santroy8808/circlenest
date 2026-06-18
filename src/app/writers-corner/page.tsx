import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { WritersCornerDashboard } from "@/components/writers-corner/writers-corner-dashboard";
import { getWriterAccessState, safeListManuscripts } from "@/modules/writers-corner/writers-corner.service";

export default async function WritersCornerPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/writers-corner");
  }

  const [access, manuscripts] = await Promise.all([getWriterAccessState(session.user.id), safeListManuscripts(session.user.id)]);

  return (
    <AppShell>
      <WritersCornerDashboard access={access} manuscripts={manuscripts} />
    </AppShell>
  );
}
