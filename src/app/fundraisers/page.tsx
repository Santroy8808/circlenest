import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { FundraisersDirectory } from "@/components/fundraisers-funds/fundraisers-directory";
import { AppShell } from "@/components/platform/app-shell";
import { isAdminRole } from "@/lib/platform/roles";
import { getFundraiserCreateState, safeListFundraisers } from "@/modules/fundraisers-funds/fundraisers-funds.service";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";

export default async function FundraisersPage({ searchParams }: { searchParams: { category?: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/fundraisers");
  }

  const access = await canUserAccessFeature(session.user.id, "fundraisers.create");
  if (!isAdminRole(session.user.role) && !access.allowed) notFound();

  const [fundraisers, createState] = await Promise.all([
    safeListFundraisers({ category: searchParams.category }),
    getFundraiserCreateState(session.user.id)
  ]);

  return (
    <AppShell>
      <FundraisersDirectory createState={createState} fundraisers={fundraisers} selectedCategory={searchParams.category} />
    </AppShell>
  );
}
