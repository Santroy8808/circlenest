import { notFound } from "next/navigation";
import { AppShell } from "@/components/platform/app-shell";
import { UserTicketThread } from "@/components/feedback/user-ticket-thread";
import { requireMemberPage } from "@/lib/platform/page-access";
import { getFeedbackTicket } from "@/modules/feedback-support/feedback-support.service";

export default async function FeedbackTicketPage({ params }: { params: { publicId: string } }) {
  const session = await requireMemberPage(`/feedback/tickets/${encodeURIComponent(params.publicId)}`);
  const initialView = await getFeedbackTicket(session.user.id, params.publicId);
  if (!initialView.ok || initialView.audience !== "creator") notFound();

  return (
    <AppShell>
      <UserTicketThread initialView={initialView} />
    </AppShell>
  );
}
