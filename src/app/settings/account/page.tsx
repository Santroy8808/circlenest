import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { AccountExportClient } from "@/components/settings/account-export-client";
import { AdminModeSettings } from "@/components/settings/admin-mode-settings";
import { PetitionForm } from "@/components/settings/petition-form";
import { SecureAreaSessionClient } from "@/components/security/secure-area-session-client";
import { ensureBootstrapAdmins, isAdminUser } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { hasFreshSecureAreaAccess } from "@/lib/security/action-access";
import { requireSecureAreaPage } from "@/lib/security/secure-area-guards";

export default async function SettingsAccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  await ensureBootstrapAdmins();
  requireSecureAreaPage(session.user.id, "/settings/account");

  const [user, adminRoleAssigned] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        deactivatedAt: true,
        deletionRequestedAt: true,
      },
    }),
    isAdminUser(session.user.id),
  ]);

  return (
    <AppShell>
      <SecureAreaSessionClient />
      <section className="card space-y-4 p-4">
        {adminRoleAssigned ? <AdminModeSettings /> : null}
        <PetitionForm />
        <section className="rounded border border-[var(--border)] p-3">
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">Account lifecycle</h2>
          <p className="mt-1 text-xs text-slate-300">Deactivation and deletion requests stay behind secure-area access.</p>
          <div className="mt-2 rounded border border-[var(--border)] bg-[color:var(--card-alt)] p-2 text-xs text-slate-200">
            <p>Deactivated: {user?.deactivatedAt ? new Date(user.deactivatedAt).toLocaleString() : "No"}</p>
            <p>Deletion requested: {user?.deletionRequestedAt ? new Date(user.deletionRequestedAt).toLocaleString() : "No"}</p>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <form action={async () => {
              "use server";
              const { auth } = await import("@/auth");
              const { prisma } = await import("@/lib/db/prisma");
              const { revalidatePath } = await import("next/cache");
              const current = await auth();
              if (!current?.user?.id) return;
              if (!hasFreshSecureAreaAccess(current.user.id)) return;
              await prisma.user.update({
                where: { id: current.user.id },
                data: { deactivatedAt: new Date(), sessionVersion: { increment: 1 } },
              });
              await prisma.authSecurityEvent.create({
                data: {
                  userId: current.user.id,
                  eventType: "ACCOUNT_DEACTIVATED",
                  metadata: JSON.stringify({ requestedAt: new Date().toISOString() }),
                },
              });
              revalidatePath("/settings/account");
            }}>
              <button type="submit" className="rounded border border-[var(--border)] px-3 py-2 text-sm">Deactivate account</button>
            </form>
            <form action={async () => {
              "use server";
              const { auth } = await import("@/auth");
              const { prisma } = await import("@/lib/db/prisma");
              const { revalidatePath } = await import("next/cache");
              const current = await auth();
              if (!current?.user?.id) return;
              if (!hasFreshSecureAreaAccess(current.user.id)) return;
              await prisma.user.update({
                where: { id: current.user.id },
                data: { deletionRequestedAt: new Date() },
              });
              await prisma.authSecurityEvent.create({
                data: {
                  userId: current.user.id,
                  eventType: "ACCOUNT_DELETION_REQUESTED",
                  metadata: JSON.stringify({ requestedAt: new Date().toISOString() }),
                },
              });
              revalidatePath("/settings/account");
            }}>
              <button type="submit" className="rounded border border-red-400 px-3 py-2 text-sm text-red-300">Request deletion</button>
            </form>
            <AccountExportClient />
          </div>
        </section>
      </section>
    </AppShell>
  );
}
