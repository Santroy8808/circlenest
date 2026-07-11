import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { FeatureUnavailableNotice } from "@/components/feature-availability/feature-unavailable-notice";
import { MailClient } from "@/components/mail/mail-client";
import { AppShell } from "@/components/platform/app-shell";
import { isAdminRole } from "@/lib/platform/roles";
import {
  getMailPreference,
  getMailThread,
  isInternalMailEnabled,
  listMailThreadsPage
} from "@/modules/mail/mail.service";
import { mailFolderSchema, type MailFolder } from "@/modules/mail/types";

export default async function MailPage({ searchParams }: { searchParams: { folder?: string; thread?: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/mail");
  }

  if (!isInternalMailEnabled()) {
    return (
      <AppShell>
        <FeatureUnavailableNotice backHref="/messages" backLabel="Back to Messages" featureLabel="Mail" />
      </AppShell>
    );
  }

  const folder = mailFolderSchema.catch("inbox").parse(searchParams.folder ?? "inbox") as MailFolder;
  const [threadPage, preference] = await Promise.all([
    listMailThreadsPage(session.user.id, folder),
    getMailPreference(session.user.id)
  ]);
  const selected = searchParams.thread ? await getMailThread(session.user.id, searchParams.thread) : null;

  return (
    <AppShell>
      <MailClient
        currentUserId={session.user.id}
        initialFolder={folder}
        initialNextCursor={threadPage.nextCursor}
        initialPreference={preference}
        initialSelectedThread={selected?.ok ? selected.thread : null}
        initialThreads={threadPage.threads}
        isAdmin={isAdminRole(session.user.role)}
      />
    </AppShell>
  );
}
