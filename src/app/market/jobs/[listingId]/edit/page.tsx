import { redirect } from "next/navigation";

export default async function MarketEditJobListingRedirectPage(props: { params: Promise<{ listingId: string }> }) {
  const params = await props.params;
  redirect(`/jobs/${params.listingId}/edit`);
}
