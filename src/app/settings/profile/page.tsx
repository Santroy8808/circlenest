import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { SecureAreaSessionClient } from "@/components/security/secure-area-session-client";
import { requireSecureAreaPage } from "@/lib/security/secure-area-guards";

const links = [
  { title: "Profile", href: "/profile/edit", description: "Edit your main profile fields." },
  { title: "My Resume", href: "/profile/resume", description: "Update your resume details and visibility." },
  { title: "My Pics", href: "/profile/gallery", description: "Manage albums, media, and storage usage." },
  { title: "My Scientology", href: "/profile/scientology", description: "Control the Scientology profile data used across the platform." },
  { title: "Theme", href: "/settings/theme", description: "Adjust theme and feed-mode controls." },
  { title: "My Subscription", href: "/settings/subscription", description: "View tier and billing controls." },
] as const;

export default async function SettingsProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  requireSecureAreaPage(session.user.id, "/settings/profile");

  return (
    <AppShell>
      <SecureAreaSessionClient />
      <section className="card space-y-4 p-4">
        <div>
          <h1 className="text-xl font-semibold">Settings: Profile</h1>
          <p className="text-sm text-slate-400">Open the exact profile area you want to update.</p>
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
