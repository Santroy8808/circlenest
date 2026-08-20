import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDefaultHomeHref } from "@/modules/home-preferences/default-home-preferences.service";

export default async function RootPage() {
  const session = await auth();

  if (session?.user && !session.user.revoked) {
    redirect(await getDefaultHomeHref(session.user.id));
  }

  redirect("/marketplace");
}
