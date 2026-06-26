import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { GroupMediaClient } from "@/components/groups/media/group-media-client";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { safeListGroupAssets } from "@/modules/group-media-docs/group-media-docs.service";

export default async function GroupMediaPage({ params }: { params: { groupId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/groups/${params.groupId}/media`);
  }

  const activeActor = await getActiveAccountActor(session.user.id);
  const result = await safeListGroupAssets(activeActor.actorUserId, params.groupId);

  if (!result.ok) {
    notFound();
  }

  return (
    <AppShell>
      <GroupMediaClient
        group={result.group}
        initialAssets={result.assets}
        initialStorageUsedBytes={result.storageUsedBytes}
        viewerCanComment={result.viewerCanComment}
        viewerCanUpload={result.viewerCanUpload}
      />
    </AppShell>
  );
}
