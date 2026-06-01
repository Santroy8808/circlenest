import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { AuditorListingFormClient } from "@/components/auditors/auditor-listing-form-client";

export default async function ImAnAuditorPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const listing = await prisma.auditorListing.findUnique({
    where: { userId: session.user.id },
    include: { media: true },
  });

  return (
    <AppShell>
      <AuditorListingFormClient initialListing={listing} />
    </AppShell>
  );
}

