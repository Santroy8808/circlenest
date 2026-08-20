import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getMarketplaceCreateState } from "@/modules/marketplace/marketplace-listings.service";
import { MARKETPLACE_TEMPLATES } from "@/modules/marketplace/marketplace-templates";

export default async function NewMarketplaceListingPage() {
  const session = await auth();
  if (!session?.user || session.user.revoked) redirect("/login?callbackUrl=/marketplace/new");
  const createState = await getMarketplaceCreateState(session.user.id);
  return (
    <section>
      <h1>Create a listing</h1>
      <p>Choose what you are offering or looking for, then provide the details buyers and responders need.</p>
      <pre>{JSON.stringify({ createState, templates: MARKETPLACE_TEMPLATES }, null, 2)}</pre>
    </section>
  );
}
