import { redirect } from "next/navigation";

export default async function JobListingPage(props: { params: Promise<{ listingId: string }> }) {
  const params = await props.params;
  redirect(`/market/jobs/${params.listingId}`);
}
