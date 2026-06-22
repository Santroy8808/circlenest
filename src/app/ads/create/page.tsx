import { redirect } from "next/navigation";
import { AdDestinationKind, InterestCategory } from "@prisma/client";
import { auth } from "@/auth";
import { CreateAdCampaignForm, type InitialAdCampaignDraft } from "@/components/ads-credits/create-ad-campaign-form";
import { AppShell } from "@/components/platform/app-shell";
import { getAdsManagerView } from "@/modules/ads-credits/ads-credits.service";

function readText(value: string | string[] | undefined, maxLength: number) {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.slice(0, maxLength);
}

function readAdDestination(value: string | string[] | undefined) {
  const first = Array.isArray(value) ? value[0] : value;
  if (!first) return undefined;
  return Object.values(AdDestinationKind).includes(first as AdDestinationKind) ? (first as AdDestinationKind) : undefined;
}

function readInterest(value: string | string[] | undefined) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.filter((item): item is InterestCategory => Object.values(InterestCategory).includes(item as InterestCategory)).slice(0, 6);
}

export default async function CreateAdPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/ads/create");
  }

  const adsManager = await getAdsManagerView(session.user.id);
  const initialDraft: InitialAdCampaignDraft = {
    title: readText(searchParams?.title, 120),
    body: readText(searchParams?.body, 280),
    destinationKind: readAdDestination(searchParams?.destinationKind),
    marketListingId: readText(searchParams?.marketListingId, 120),
    businessArticleId: readText(searchParams?.businessArticleId, 120),
    customDestinationUrl: readText(searchParams?.customDestinationUrl, 600),
    targetInterestCategories: readInterest(searchParams?.targetInterestCategories)
  };

  return (
    <AppShell>
      <CreateAdCampaignForm adsManager={adsManager} initialDraft={initialDraft} />
    </AppShell>
  );
}
