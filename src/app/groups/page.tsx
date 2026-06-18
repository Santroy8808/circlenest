import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GroupsDirectoryClient } from "@/components/groups/groups-directory-client";
import { AppShell } from "@/components/platform/app-shell";
import { safeListGroups } from "@/modules/groups/groups.service";
import { groupDirectoryModeSchema, type GroupDirectoryMode } from "@/modules/groups/types";

export default async function GroupsPage({ searchParams }: { searchParams: { mode?: string; q?: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/groups");
  }

  const mode = groupDirectoryModeSchema.catch("joined").parse(searchParams.mode ?? "joined") as GroupDirectoryMode;
  const groups = await safeListGroups({
    viewerUserId: session.user.id,
    mode,
    query: searchParams.q
  });

  return (
    <AppShell>
      <GroupsDirectoryClient initialGroups={groups} initialMode={mode} />
    </AppShell>
  );
}
