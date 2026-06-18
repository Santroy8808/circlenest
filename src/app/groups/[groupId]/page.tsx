import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { GroupProfile } from "@/components/groups/group-profile";
import { AppShell } from "@/components/platform/app-shell";
import { getGroupProfile } from "@/modules/groups/groups.service";

export default async function GroupProfilePage({ params }: { params: { groupId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/groups/${params.groupId}`);
  }

  const result = await getGroupProfile(session.user.id, params.groupId);

  if (!result.ok) {
    notFound();
  }

  return (
    <AppShell>
      <GroupProfile group={result.group} />
    </AppShell>
  );
}
