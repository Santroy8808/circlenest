import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { SecureAreaUnlock } from "@/components/settings-secure-areas/secure-area-unlock";

export default async function SecureAreaPage(props: { searchParams: Promise<{ next?: string }> }) {
  const searchParams = await props.searchParams;
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/secure-area?next=${encodeURIComponent(searchParams.next ?? "/settings")}`);
  }

  return (
    <AppShell>
      <SecureAreaUnlock nextPath={searchParams.next ?? "/settings"} />
    </AppShell>
  );
}
