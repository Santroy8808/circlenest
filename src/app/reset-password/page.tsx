import { AuthCard } from "@/components/auth/auth-card";
import { PasswordResetForm } from "@/components/auth/password-reset-form";

export default function ResetPasswordPage({
  searchParams
}: {
  searchParams?: { token?: string };
}) {
  const token = searchParams?.token?.trim() ?? "";

  return (
    <AuthCard
      eyebrow="Security"
      title={token ? "Choose a new password" : "Reset your password"}
      subtitle={token ? "This secure link lets you set a new password." : "We will send reset instructions if the account can be found."}
    >
      <PasswordResetForm initialToken={token} />
    </AuthCard>
  );
}
