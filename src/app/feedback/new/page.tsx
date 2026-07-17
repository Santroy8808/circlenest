import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthCard } from "@/components/auth/auth-card";
import { FeedbackTicketForm } from "@/components/feedback/feedback-ticket-form";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";

export default async function NewFeedbackTicketPage({
  searchParams
}: {
  searchParams?: { from?: string };
}) {
  const session = await auth();
  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/feedback/new");
  }

  const access = await canUserAccessFeature(session.user.id, "support.createRequest");
  if (!access.allowed) notFound();

  return (
    <AuthCard
      eyebrow="Feedback Ticket"
      title="Report an issue"
      subtitle="Create a focused ticket from anywhere in the app. Specific reports are easier to fix and verify."
    >
      <FeedbackTicketForm from={searchParams?.from ?? "/"} initialKind="ISSUE_REPORT" />
    </AuthCard>
  );
}
