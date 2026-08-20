import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { getDefaultHomeHref } from "@/modules/home-preferences/default-home-preferences.service";
import { isFeatureEnabled } from "@/modules/feature-flags/feature-flags.service";

export default async function RootPage() {
  const [session, marketplaceFocused] = await Promise.all([
    auth(),
    isFeatureEnabled("marketplace.focused_rollout")
  ]);

  if (marketplaceFocused) redirect("/marketplace");

  if (session?.user && !session.user.revoked) {
    redirect(await getDefaultHomeHref(session.user.id));
  }

  return (
    <AuthCard
      eyebrow="Theta-Space Access"
      title="Log in"
      subtitle="Use your member credentials. Email and handle login are both supported."
    >
      <LoginForm callbackUrl="/home/default" />
    </AuthCard>
  );
}
