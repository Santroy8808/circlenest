import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { MarketplaceInteractions } from "@/components/marketplace/marketplace-interactions";
import { listMarketplaceInteractions } from "@/modules/marketplace/marketplace-interactions.service";

export default async function MarketplaceInteractionsPage() {
  const session = await auth();
  if (!session?.user || session.user.revoked) redirect("/login?callbackUrl=/marketplace/interactions");
  const result = await listMarketplaceInteractions(session.user.id);
  return <MarketplaceInteractions initialInteractions={result.ok ? result.interactions : []} />;
}
