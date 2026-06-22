import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { BlockedUsersClient } from "@/components/settings-secure-areas/blocked-users-client";
import { listBlockedUsers } from "@/modules/social-graph/blocked-users.service";

export default async function BlockedUsersSettingsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/settings/security/blocked-users");
  }

  const blockedUsers = await listBlockedUsers(session.user.id);

  return (
    <AppShell>
      <section className="surface rounded-md p-6">
        <Link className="btn-secondary mb-5 inline-flex" href="/settings/security">
          Back to Security
        </Link>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Security</p>
        <h1 className="mt-3 text-3xl font-semibold">Blocked users</h1>
        <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
          Review accounts you have blocked and remove blocks when you want them visible again.
        </p>
      </section>
      <div className="mt-5">
        <BlockedUsersClient initialBlockedUsers={blockedUsers} />
      </div>
    </AppShell>
  );
}
