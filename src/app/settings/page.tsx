import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { SecureAreaSessionClient } from "@/components/security/secure-area-session-client";
import { MobileNavigationSettings } from "@/components/settings/mobile-navigation-settings";
import { requireSecureAreaPage } from "@/lib/security/secure-area-guards";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  requireSecureAreaPage(session.user.id, "/settings");

  return (
    <AppShell>
      <SecureAreaSessionClient />
      <div className="card p-3">
        <h1 className="mb-2 text-lg font-semibold text-[var(--text-strong)]">Settings</h1>
        <div className="grid gap-1 text-sm">
          <Link href="/settings/theme" className="underline underline-offset-2 hover:scale-[1.02]">Theme Settings</Link>
          <Link href="/profile/edit" className="underline underline-offset-2 hover:scale-[1.02]">Profile Settings</Link>
          <Link href="/profile/scientology" className="underline underline-offset-2 hover:scale-[1.02]">My Scientology</Link>
          <Link href="/profile/resume" className="underline underline-offset-2 hover:scale-[1.02]">Resume</Link>
          <Link href="/settings#security" className="underline underline-offset-2 hover:scale-[1.02]">Security</Link>
          <Link href="/settings#rules" className="underline underline-offset-2 hover:scale-[1.02]">My Rules</Link>
          <Link href="/settings#subscription" className="underline underline-offset-2 hover:scale-[1.02]">My Subscription</Link>
        </div>
        <MobileNavigationSettings />
      </div>
    </AppShell>
  );
}
