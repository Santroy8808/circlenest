import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDefaultHomeHref } from "@/modules/home-preferences/default-home-preferences.service";

export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/home/default");
  }

  redirect(await getDefaultHomeHref(session.user.id));
}
