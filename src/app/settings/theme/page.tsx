import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { SecureAreaSessionClient } from "@/components/security/secure-area-session-client";
import { ThemeSettingsClient } from "@/components/settings/theme-settings-client";
import { requireSecureAreaPage } from "@/lib/security/secure-area-guards";
import { canChangeFeedType } from "@/lib/policy/tier-policy";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";

export default async function ThemeSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  requireSecureAreaPage(session.user.id, "/settings/theme");
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true, subscriptionTier: true } });
  const policy = resolveMemberAccessPolicy(session.user.id, user);

  return (
    <AppShell>
      <SecureAreaSessionClient />
      <ThemeSettingsClient canChangeFeedType={canChangeFeedType(policy)} />
    </AppShell>
  );
}
