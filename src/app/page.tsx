import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";

export default async function RootPage() {
  const session = await auth();

  if (session?.user && !session.user.revoked) {
    redirect("/home");
  }

  return (
    <AuthCard
      eyebrow="Theta-Space Access"
      title="Log in"
      subtitle="Use your member credentials. Email and username login are both supported."
    >
      <LoginForm callbackUrl="/home" />
    </AuthCard>
  );
}
