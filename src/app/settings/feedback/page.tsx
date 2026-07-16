import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { FeedbackTicketForm } from "@/components/feedback/feedback-ticket-form";
import { AppShell } from "@/components/platform/app-shell";
import { isFeatureEnabled } from "@/modules/feature-flags/feature-flags.service";

export default async function SettingsFeedbackPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/settings/feedback");
  }

  if (!(await isFeatureEnabled("support.feedback_center"))) {
    return (
      <AppShell>
        <section className="surface rounded-md p-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Settings · Help</p>
          <h1 className="mt-3 text-3xl font-semibold">Feedback Center unavailable</h1>
          <p className="mt-3 text-[var(--muted)]">Platform Management has temporarily disabled new feedback and support submissions.</p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="grid gap-5">
        <section className="surface rounded-md p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Settings · Help</p>
          <h1 className="mt-3 text-3xl font-semibold">Feedback Center</h1>
          <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
            Ask for help, report a problem, or suggest an improvement. Your submission goes to the administrator support queue with the page you came from so it can be reviewed in context.
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Email is optional. Replies and follow-up are handled through the platform support process.
          </p>
        </section>
        <section className="surface max-w-3xl rounded-md p-6">
          <FeedbackTicketForm from="/settings/feedback" initialKind="SUPPORT_REQUEST" />
        </section>
      </main>
    </AppShell>
  );
}
