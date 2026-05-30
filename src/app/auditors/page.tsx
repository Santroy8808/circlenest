import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { AuditorHubClient } from "@/components/auditors/auditor-hub-client";

export default async function AuditorsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const listings = await prisma.auditorListing.findMany({
    include: { user: { select: { id: true, username: true } }, media: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <AppShell>
      <AuditorHubClient initialListings={listings} />
    </AppShell>
  );
}
