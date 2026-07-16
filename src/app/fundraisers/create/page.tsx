import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { CreateFundraiserForm } from "@/components/fundraisers-funds/create-fundraiser-form";
import { AppShell } from "@/components/platform/app-shell";
import { logUnavailableFeatureClick } from "@/modules/feature-availability/feature-availability.service";
import { getFundraiserCreateState } from "@/modules/fundraisers-funds/fundraisers-funds.service";

export default async function CreateFundraiserPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/fundraisers/create");
  }

  const createState = await getFundraiserCreateState(session.user.id);

  if (!createState.viewerCanCreate) {
    await logUnavailableFeatureClick({
      actorUserId: session.user.id,
      featureKey: "fundraisers.create",
      label: "Create Fundraiser",
      requestedPath: "/fundraisers/create",
      source: "route-gate",
      reason: createState.reason
    });

    notFound();
  }

  return (
    <AppShell>
      <CreateFundraiserForm createState={createState} />
    </AppShell>
  );
}
