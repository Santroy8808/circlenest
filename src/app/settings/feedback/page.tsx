import { notFound } from "next/navigation";
import { UserFeedbackList } from "@/components/feedback/user-feedback-list";
import { AppShell } from "@/components/platform/app-shell";
import { requireMemberPage } from "@/lib/platform/page-access";
import { isFeatureEnabled } from "@/modules/feature-flags/feature-flags.service";
import { listUserFeedbackTickets } from "@/modules/feedback-support/feedback-support.service";

export default async function SettingsFeedbackPage() {
  const session = await requireMemberPage("/settings/feedback");
  if (!(await isFeatureEnabled("support.feedback_center"))) notFound();
  const initialView = await listUserFeedbackTickets(session.user.id);
  if (!initialView.ok) notFound();

  return (
    <AppShell>
      <UserFeedbackList initialView={initialView} />
    </AppShell>
  );
}
