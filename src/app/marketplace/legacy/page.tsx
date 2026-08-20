import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { listLegacyMarketplaceArchive } from "@/modules/marketplace/marketplace-search.service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function LegacyMarketplacePage() {
  const session = await auth();
  if (!session?.user || session.user.revoked) redirect("/login?callbackUrl=/marketplace/legacy");
  const archive = await listLegacyMarketplaceArchive(session.user.id, session.user.role);
  return <section><h1>Legacy listing archive</h1><p>Previous Market and Job records are preserved here as read-only history.</p><pre>{JSON.stringify(archive, null, 2)}</pre></section>;
}
