import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { GroupForumClient } from "@/components/groups/forum/group-forum-client";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { isAdminRole } from "@/lib/platform/roles";
import { safeListGroupForumThreads } from "@/modules/group-forum/group-forum.service";

export default async function GroupForumPage({ params }: { params: { groupId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/groups/${params.groupId}/forum`);
  }

  const activeActor = await getActiveAccountActor(session.user.id);
  const result = await safeListGroupForumThreads(activeActor.actorUserId, params.groupId);

  if (!result.ok) {
    notFound();
  }

  return (
    <AppShell>
      <GroupForumClient group={result.group} initialThreads={result.threads} isAdmin={isAdminRole(session.user.role)} viewerCanPost={result.viewerCanPost} />
    </AppShell>
  );
}
