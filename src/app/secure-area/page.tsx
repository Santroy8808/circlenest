import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { SecureAreaUnlockClient } from "@/components/security/secure-area-unlock-client";
import { SECURE_AREA_COOKIE_NAME, hasSecureAreaAccess, isSecureAreaRoute } from "@/lib/security/secure-area";

export default async function SecureAreaPage({
  searchParams,
}: {
  searchParams?: { next?: string; reason?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const next = searchParams?.next && isSecureAreaRoute(searchParams.next) ? searchParams.next : "/settings";
  const existingToken = cookies().get(SECURE_AREA_COOKIE_NAME)?.value;
  if (hasSecureAreaAccess(session.user.id, existingToken)) {
    redirect(next);
  }

  return <SecureAreaUnlockClient next={next} reason={searchParams?.reason} />;
}
