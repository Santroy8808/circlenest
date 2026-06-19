import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function RootPage() {
  const session = await auth();

  if (session?.user && !session.user.revoked) {
    redirect("/home");
  }

  redirect("/login");
}
