import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { UsersManualClient } from "@/components/users-manual/users-manual-client";
import { buildUsersManual } from "@/modules/users-manual/users-manual-content";

export default async function UsersManualPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/settings/users-manual");
  }

  return (
    <AppShell>
      <UsersManualClient manual={buildUsersManual()} />
    </AppShell>
  );
}
