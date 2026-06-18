import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { GroupForumThreadClient } from "@/components/groups/forum/group-forum-thread-client";
import { AppShell } from "@/components/platform/app-shell";
import { getGroupForumThread } from "@/modules/group-forum/group-forum.service";

export default async function GroupForumThreadPage({ params }: { params: { groupId: string; threadId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/groups/${params.groupId}/forum/${params.threadId}`);
  }

  const result = await getGroupForumThread(session.user.id, params.groupId, params.threadId);

  if (!result.ok) {
    notFound();
  }

  return (
    <AppShell>
      <GroupForumThreadClient group={result.group} initialThread={result.thread} viewerCanPost={result.viewerCanPost} />
    </AppShell>
  );
}
