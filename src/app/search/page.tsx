import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { SearchPageView } from "@/components/search-discovery/search-page-view";
import { safeSearchPlatform } from "@/modules/search-discovery/search-discovery.service";

export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/search");
  }

  const search = await safeSearchPlatform(session.user.id, searchParams.q);

  return (
    <AppShell>
      <SearchPageView search={search} />
    </AppShell>
  );
}
