import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { SecureAreaSessionClient } from "@/components/security/secure-area-session-client";
import { StreamRulesSettings } from "@/components/settings/stream-rules-settings";
import { prisma } from "@/lib/db/prisma";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";
import { canChangeFeedType } from "@/lib/policy/tier-policy";
import { requireSecureAreaPage } from "@/lib/security/secure-area-guards";

export default async function SettingsRulesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  requireSecureAreaPage(session.user.id, "/settings/security/rules");
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true, subscriptionTier: true } });
  const policy = resolveMemberAccessPolicy(session.user.id, user);

  return (
    <AppShell>
      <SecureAreaSessionClient />
      <section className="card p-4">
        <StreamRulesSettings canChangeFeedType={canChangeFeedType(policy)} />
      </section>
    </AppShell>
  );
}
