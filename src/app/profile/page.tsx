import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function ProfileIndexPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/profile");
  }

  redirect(`/profile/${session.user.username}`);
}
