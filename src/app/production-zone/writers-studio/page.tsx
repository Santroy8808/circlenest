import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminUser } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { WritersStudioManager } from "@/components/writers-studio/writers-studio-manager";
import { canCreateWritersStudio, resolveProductionZoneAccess } from "@/lib/policy/production-zone";
import { serializeWritersStudioProjects } from "@/lib/writers-studio/writers-studio";

export default async function WritersStudioPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { subscriptionTier: true, iasStatus: true },
  });
  const isAdmin = await isAdminUser(session.user.id);
  const isInvitedCreator = Boolean(user?.iasStatus && user.iasStatus.toUpperCase() === "INVITED_CREATOR");
  const access = resolveProductionZoneAccess(user?.subscriptionTier, isInvitedCreator);
  const canCreate = isAdmin || canCreateWritersStudio(user?.subscriptionTier, isInvitedCreator);

  const [ownProjects, publicProjects] = await Promise.all([
    prisma.writerStudioProject.findMany({
      where: { ownerId: session.user.id },
      include: {
        owner: { select: { id: true, username: true, fullName: true } },
        _count: { select: { articles: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.writerStudioProject.findMany({
      where: { isPublic: true, NOT: { ownerId: session.user.id } },
      include: {
        owner: { select: { id: true, username: true, fullName: true } },
        _count: { select: { articles: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <AppShell>
      <section className="card space-y-6 p-4">
        <div>
          <h1 className="text-xl font-semibold">Writers Corner</h1>
          <p className="text-sm text-slate-500">Browse manuscripts, open a manuscript to create chapters, and use the chapter page for paged reading and editing.</p>
        </div>
        {!canCreate ? (
          <p className="rounded border border-amber-400/30 bg-amber-400/10 p-2 text-sm text-amber-200">{access.reason ?? "Writers Corner creation is locked."}</p>
        ) : null}
        <WritersStudioManager
          canCreate={canCreate}
          accessReason={access.reason ?? null}
          ownProjects={serializeWritersStudioProjects(ownProjects)}
          publicProjects={serializeWritersStudioProjects(publicProjects)}
        />
      </section>
    </AppShell>
  );
}
