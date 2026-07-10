import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage({
  searchParams
}: {
  searchParams?: { callbackUrl?: string };
}) {
  const session = await auth();

  if (session?.user && !session.user.revoked) {
    redirect("/home");
  }

  return (
    <AuthCard
      eyebrow="Theta-Space Access"
      title="Log in"
      subtitle="Theta-Space is invite-only. Members can log in with an email address or handle."
    >
      <LoginForm callbackUrl={searchParams?.callbackUrl ?? "/home"} />
    </AuthCard>
  );
}
