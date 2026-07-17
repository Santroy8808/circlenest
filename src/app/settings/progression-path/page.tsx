import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { ProgressionPathClient } from "@/components/settings-secure-areas/progression-path-client";

export default async function ProgressionPathPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/settings/progression-path");
  }

  return (
    <AppShell>
      <ProgressionPathClient />
    </AppShell>
  );
}
