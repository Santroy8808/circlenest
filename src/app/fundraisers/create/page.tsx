import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CreateFundraiserForm } from "@/components/fundraisers-funds/create-fundraiser-form";
import { AppShell } from "@/components/platform/app-shell";
import { getFundraiserCreateState } from "@/modules/fundraisers-funds/fundraisers-funds.service";

export default async function CreateFundraiserPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/fundraisers/create");
  }

  const createState = await getFundraiserCreateState(session.user.id);

  return (
    <AppShell>
      <CreateFundraiserForm createState={createState} />
    </AppShell>
  );
}
