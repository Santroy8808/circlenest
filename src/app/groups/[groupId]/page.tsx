import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { GroupProfile } from "@/components/groups/group-profile";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { getGroupProfile } from "@/modules/groups/groups.service";

export default async function GroupProfilePage({ params }: { params: { groupId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/groups/${params.groupId}`);
  }

  const activeActor = await getActiveAccountActor(session.user.id);
  const result = await getGroupProfile(activeActor.actorUserId, params.groupId);

  if (!result.ok) {
    notFound();
  }

  return (
    <AppShell>
      <GroupProfile group={result.group} />
    </AppShell>
  );
}
