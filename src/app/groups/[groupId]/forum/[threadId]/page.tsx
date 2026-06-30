import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { GroupForumThreadClient } from "@/components/groups/forum/group-forum-thread-client";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { isAdminRole } from "@/lib/platform/roles";
import { getGroupForumThread } from "@/modules/group-forum/group-forum.service";

export default async function GroupForumThreadPage({ params }: { params: { groupId: string; threadId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/groups/${params.groupId}/forum/${params.threadId}`);
  }

  const activeActor = await getActiveAccountActor(session.user.id);
  const result = await getGroupForumThread(activeActor.actorUserId, params.groupId, params.threadId);

  if (!result.ok) {
    notFound();
  }

  return (
    <AppShell>
      <GroupForumThreadClient group={result.group} initialThread={result.thread} isAdmin={isAdminRole(session.user.role)} viewerCanPost={result.viewerCanPost} />
    </AppShell>
  );
}
