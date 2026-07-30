import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { FundraiserDetail } from "@/components/fundraisers-funds/fundraiser-detail";
import { AppShell } from "@/components/platform/app-shell";
import { safeGetFundraiserDetail } from "@/modules/fundraisers-funds/fundraisers-funds.service";

export default async function FundraiserDetailPage(props: { params: Promise<{ campaignId: string }> }) {
  const params = await props.params;
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/fundraisers/${params.campaignId}`);
  }

  const result = await safeGetFundraiserDetail(session.user.id, params.campaignId);

  if (!result.ok) {
    notFound();
  }

  return (
    <AppShell>
      <FundraiserDetail campaign={result.campaign} />
    </AppShell>
  );
}
