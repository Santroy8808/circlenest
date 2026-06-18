import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MailClient } from "@/components/mail/mail-client";
import { AppShell } from "@/components/platform/app-shell";
import {
  getMailPreference,
  getMailThread,
  safeListMailThreads
} from "@/modules/mail/mail.service";
import { mailFolderSchema, type MailFolder } from "@/modules/mail/types";

export default async function MailPage({ searchParams }: { searchParams: { folder?: string; thread?: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/mail");
  }

  const folder = mailFolderSchema.catch("inbox").parse(searchParams.folder ?? "inbox") as MailFolder;
  const [threads, preference] = await Promise.all([
    safeListMailThreads(session.user.id, folder),
    getMailPreference(session.user.id)
  ]);
  const selected = searchParams.thread ? await getMailThread(session.user.id, searchParams.thread) : null;

  return (
    <AppShell>
      <MailClient
        initialFolder={folder}
        initialPreference={preference}
        initialSelectedThread={selected?.ok ? selected.thread : null}
        initialThreads={threads}
      />
    </AppShell>
  );
}
