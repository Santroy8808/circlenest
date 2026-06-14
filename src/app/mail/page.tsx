import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { MailPageClient } from "@/components/mail/mail-page-client";

export default async function MailPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <AppShell>
      <div className="card p-4">
        <MailPageClient />
      </div>
    </AppShell>
  );
}
