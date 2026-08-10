import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { inspectOptionalSystemEmailUnsubscribeToken } from "@/modules/system-email-preferences/system-email-preferences.service";

export const metadata: Metadata = {
  title: "Unsubscribe | Theta-Space",
  description: "Manage optional Theta-Space system email reminders and invite follow-ups."
};

export default async function UnsubscribePage(
  props: {
    searchParams?: Promise<{ token?: string; status?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const details = inspectOptionalSystemEmailUnsubscribeToken(searchParams?.token);
  const status = searchParams?.status;

  if (status === "success" && details) {
    return (
      <AuthCard
        eyebrow="Email Preferences"
        title="Optional emails stopped"
        subtitle={`Optional Theta-Space system emails will no longer be sent to ${details.maskedEmail}.`}
      >
        <div className="grid gap-4 text-sm leading-7 text-[var(--muted)]">
          <p>
            This applies to optional system emails like beta reminders and invite follow-ups.
          </p>
          <p>
            Required account, login, and security emails will still be sent when needed.
          </p>
        </div>
      </AuthCard>
    );
  }

  if (!details) {
    return (
      <AuthCard
        eyebrow="Email Preferences"
        title="Unsubscribe link invalid"
        subtitle="This link is missing information or is no longer valid."
      >
        <p className="text-sm leading-7 text-[var(--muted)]">
          Return to the email you received and use the newest unsubscribe link.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      eyebrow="Email Preferences"
      title="Stop optional system emails?"
      subtitle={`Confirm that Theta-Space should stop optional system emails for ${details.maskedEmail}.`}
    >
      <div className="grid gap-4 text-sm leading-7 text-[var(--muted)]">
        <p>
          This stops optional automated emails like beta reminders and invite follow-ups.
        </p>
        <p>
          Required account, login, and security emails will still be sent when needed.
        </p>
      </div>
      <form action="/api/unsubscribe" className="mt-6 flex flex-wrap gap-3" method="post">
        <input name="token" type="hidden" value={searchParams?.token ?? ""} />
        <button className="btn-primary" type="submit">
          Confirm unsubscribe
        </button>
        <a className="btn-secondary" href="/login">
          Keep emails on
        </a>
      </form>
    </AuthCard>
  );
}
