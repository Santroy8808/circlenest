import { redirect } from "next/navigation";

export default async function MarketJobListingRedirectPage(props: { params: Promise<{ listingId: string }> }) {
  const params = await props.params;
  redirect(`/jobs/${params.listingId}`);
}
