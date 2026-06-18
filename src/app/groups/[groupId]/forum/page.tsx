import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { GroupForumClient } from "@/components/groups/forum/group-forum-client";
import { AppShell } from "@/components/platform/app-shell";
import { safeListGroupForumThreads } from "@/modules/group-forum/group-forum.service";

export default async function GroupForumPage({ params }: { params: { groupId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/groups/${params.groupId}/forum`);
  }

  const result = await safeListGroupForumThreads(session.user.id, params.groupId);

  if (!result.ok) {
    notFound();
  }

  return (
    <AppShell>
      <GroupForumClient group={result.group} initialThreads={result.threads} viewerCanPost={result.viewerCanPost} />
    </AppShell>
  );
}
