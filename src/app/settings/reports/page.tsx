import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ConductFolderClient } from "@/components/conduct-reporting/conduct-folder-client";
import { AppShell } from "@/components/platform/app-shell";
import { getConductFolder } from "@/modules/conduct-reporting/conduct-reporting.service";

export default async function ConductReportsPage() {
  const session = await auth();
  if (!session?.user || session.user.revoked) redirect("/login?callbackUrl=/settings/reports");
  return <AppShell><ConductFolderClient initialView={await getConductFolder(session.user.id)} /></AppShell>;
}
