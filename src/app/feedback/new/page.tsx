import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthCard } from "@/components/auth/auth-card";
import { FeedbackTicketForm } from "@/components/feedback/feedback-ticket-form";
import { isFeatureEnabled } from "@/modules/feature-flags/feature-flags.service";
import { resolveMembershipRouteAccess } from "@/modules/membership-policy/route-access";

export default async function NewFeedbackTicketPage({
  searchParams
}: {
  searchParams?: { from?: string };
}) {
  const session = await auth();
  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/feedback/new");
  }

  const [routeAccess, featureEnabled] = await Promise.all([
    resolveMembershipRouteAccess(session.user.id, "supportCreate", "page"),
    isFeatureEnabled("support.feedback_center")
  ]);
  if (!routeAccess.allowed || !featureEnabled) notFound();

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
