import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { SecureAreaSessionClient } from "@/components/security/secure-area-session-client";
import { prisma } from "@/lib/db/prisma";
import { requireSecureAreaPage } from "@/lib/security/secure-area-guards";
import { normalizeMembershipTier } from "@/lib/policy/tier-policy";

export default async function SettingsSecurityPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  requireSecureAreaPage(session.user.id, "/settings/security");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { subscriptionTier: true, inviteLimitException: true },
  });
  const tier = normalizeMembershipTier(user?.subscriptionTier);
  const showInviteLink = tier !== "FREE" || Boolean(user?.inviteLimitException);

  const links = [
    { title: "My Rules", href: "/settings/security/rules", description: "Adjust stream posting rules and feed-change access." },
    { title: "Phone notifications", href: "/settings/security/notification-dings", description: "Control phone dings for notifications and alerts." },
    { title: "Blocked Users", href: "/blocked-users", description: "Manage people you have blocked." },
    ...(showInviteLink
      ? [{ title: "Invite", href: "/settings/invitations", description: "Open the invite and qualification flow for your account." }]
      : []),
  ] as const;

  return (
    <AppShell>
      <SecureAreaSessionClient />
      <section className="card space-y-4 p-4">
        <div>
          <h1 className="text-xl font-semibold">Settings: Security</h1>
          <p className="text-sm text-slate-400">Open one security control at a time.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block rounded border border-[var(--border)] p-4 transition hover:border-[var(--accent)]/40 hover:bg-[color:var(--card-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
            >
              <h2 className="text-base font-semibold text-[var(--text-strong)]">{link.title}</h2>
              <p className="mt-1 text-sm text-slate-400">{link.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
