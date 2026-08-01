import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GroupsDirectoryClient } from "@/components/groups/groups-directory-client";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { listGroupsPage } from "@/modules/groups/groups.service";
import { groupDirectoryModeSchema, type GroupDirectoryMode } from "@/modules/groups/types";

export default async function CommCenterGroupsPage(props: { searchParams: Promise<{ mode?: string; q?: string }> }) {
  const searchParams = await props.searchParams;
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/comm-center/groups");
  }

  const actor = await getActiveAccountActor(session.user.id);
  const mode = groupDirectoryModeSchema.catch("joined").parse(searchParams.mode ?? "joined") as GroupDirectoryMode;
  const groupPage = await listGroupsPage({
    viewerUserId: actor.actorUserId,
    mode,
    query: searchParams.q
  });

  return (
    <AppShell>
      <GroupsDirectoryClient
        createHref="/groups/create"
        description="Scroll groups you created or joined. Use search when you need to find a specific group."
        initialGroups={groupPage.groups}
        initialMode={mode}
        initialNextCursor={groupPage.nextCursor}
        kicker="Comm Center"
        title="Groups"
      />
    </AppShell>
  );
}
