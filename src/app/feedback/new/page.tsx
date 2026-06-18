import { AuthCard } from "@/components/auth/auth-card";
import { FeedbackTicketForm } from "@/components/feedback/feedback-ticket-form";

export default function NewFeedbackTicketPage({
  searchParams
}: {
  searchParams?: { from?: string };
}) {
  return (
    <AuthCard
      eyebrow="Feedback Ticket"
      title="Report an issue"
      subtitle="Create a focused ticket from anywhere in the app. Specific reports are easier to fix and verify."
    >
      <FeedbackTicketForm from={searchParams?.from ?? "/"} />
    </AuthCard>
  );
}
