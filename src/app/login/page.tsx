import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { getDefaultHomeHref } from "@/modules/home-preferences/default-home-preferences.service";

function safeCallbackUrl(value?: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export default async function LoginPage(
  props: {
    searchParams?: Promise<{ callbackUrl?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const session = await auth();

  if (session?.user && !session.user.revoked) {
    redirect(safeCallbackUrl(searchParams?.callbackUrl) ?? await getDefaultHomeHref(session.user.id));
  }

  return (
    <AuthCard
      eyebrow="Theta-Space Access"
      title="Log in"
      subtitle="Theta-Space is invite-only. Members can log in with an email address or handle."
    >
      <LoginForm callbackUrl={safeCallbackUrl(searchParams?.callbackUrl) ?? "/home/default"} />
    </AuthCard>
  );
}
