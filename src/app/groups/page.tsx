import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GroupsDirectoryClient } from "@/components/groups/groups-directory-client";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { listGroupsPage } from "@/modules/groups/groups.service";
import { groupDirectoryModeSchema, type GroupDirectoryMode } from "@/modules/groups/types";

export default async function GroupsPage({ searchParams }: { searchParams: { mode?: string; q?: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/groups");
  }

  const activeActor = await getActiveAccountActor(session.user.id);
  const mode = groupDirectoryModeSchema.catch("joined").parse(searchParams.mode ?? "joined") as GroupDirectoryMode;
  const groupPage = await listGroupsPage({
    viewerUserId: activeActor.actorUserId,
    mode,
    query: searchParams.q
  });

  return (
    <AppShell>
      <GroupsDirectoryClient
        initialGroups={groupPage.groups}
        initialMode={mode}
        initialNextCursor={groupPage.nextCursor}
      />
    </AppShell>
  );
}
