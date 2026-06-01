import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { AuditorSearchClient } from "@/components/auditors/auditor-search-client";

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
      <AuditorSearchClient initialListings={listings} />
    </AppShell>
  );
}
