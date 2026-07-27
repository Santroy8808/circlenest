import { redirect } from "next/navigation";
import { AdminTicketsWorkspace } from "@/components/admin-moderation/admin-tickets-workspace";
import { AppShell } from "@/components/platform/app-shell";
import { requireAdminPage } from "@/lib/platform/page-access";
import { listAdminFeedbackTickets } from "@/modules/feedback-support/feedback-support.service";

export default async function AdminTicketsPage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const session = await requireAdminPage("/admin/tickets");
  const query = Object.fromEntries(
    Object.entries(searchParams ?? {}).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : []
    )
  );
  const initialView = await listAdminFeedbackTickets(session.user.id, query);
  if (!initialView.ok) redirect("/admin");

  return (
    <AppShell>
      <AdminTicketsWorkspace initialView={initialView} />
    </AppShell>
  );
}
