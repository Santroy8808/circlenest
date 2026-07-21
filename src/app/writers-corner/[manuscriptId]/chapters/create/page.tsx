import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { CreateChapterForm } from "@/components/writers-corner/create-chapter-form";
import { resolveMembershipRouteAccess } from "@/modules/membership-policy/route-access";
import { safeGetManuscriptDetail } from "@/modules/writers-corner/writers-corner.service";

export default async function CreateChapterPage({ params }: { params: { manuscriptId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/writers-corner/${params.manuscriptId}/chapters/create`);
  }

  const routeAccess = await resolveMembershipRouteAccess(session.user.id, "writersCreate", "page");
  if (!routeAccess.allowed) notFound();

  const result = await safeGetManuscriptDetail(session.user.id, params.manuscriptId);

  if (!result.ok || !result.manuscript.viewerCanEdit) {
    notFound();
  }

  return (
    <AppShell>
      <CreateChapterForm manuscript={result.manuscript} />
    </AppShell>
  );
}
