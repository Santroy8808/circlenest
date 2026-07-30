import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { ConductDisputeClient } from "@/components/conduct-reporting/conduct-dispute-client";
import { AppShell } from "@/components/platform/app-shell";
import { getConductDisputeView } from "@/modules/conduct-reporting/disputes.service";

export default async function ConductDisputePage(props: { params: Promise<{ reference: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user || session.user.revoked) redirect(`/login?callbackUrl=/settings/reports/disputes/${encodeURIComponent(params.reference)}`);
  const view = await getConductDisputeView(session.user.id, params.reference);
  if (!view) notFound();
  return <AppShell><ConductDisputeClient initialView={view} /></AppShell>;
}
