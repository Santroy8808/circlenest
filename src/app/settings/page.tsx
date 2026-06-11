import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { SecureAreaSessionClient } from "@/components/security/secure-area-session-client";
import { requireSecureAreaPage } from "@/lib/security/secure-area-guards";

const sections = [
  {
    title: "Profile",
    description: "Profile, resume, gallery, Scientology details, theme, and subscription.",
    href: "/settings/profile",
  },
  {
    title: "Security",
    description: "Rules, dings, blocked users, and invite controls.",
    href: "/settings/security",
  },
  {
    title: "Navigation",
    description: "Choose how the mobile control panel opens.",
    href: "/settings/navigation",
  },
  {
    title: "Account",
    description: "Administrator mode, petitions, exports, and account lifecycle actions.",
    href: "/settings/account",
  },
  {
    title: "Membership Comparison",
    description: "Compare Free, Activist, Pro, and Auditor access.",
    href: "/membership",
  },
] as const;

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  requireSecureAreaPage(session.user.id, "/settings");

  return (
    <AppShell>
      <SecureAreaSessionClient />
      <section className="card space-y-4 p-4">
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-slate-400">Open one control area at a time. Each subject now lives on its own page.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {sections.map((section) => (
            <article key={section.href} className="rounded border border-[var(--border)] p-4">
              <h2 className="text-base font-semibold text-[var(--text-strong)]">{section.title}</h2>
              <p className="mt-1 text-sm text-slate-400">{section.description}</p>
              <Link href={section.href} className="mt-3 inline-flex rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-strong)]">
                Open
              </Link>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
