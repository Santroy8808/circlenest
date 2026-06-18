import { AuthCard } from "@/components/auth/auth-card";
import { PasswordResetForm } from "@/components/auth/password-reset-form";

export default function ResetPasswordPage() {
  return (
    <AuthCard
      eyebrow="Security"
      title="Reset password"
      subtitle="Request a reset and apply the reset token. Confirming a reset revokes existing sessions."
    >
      <PasswordResetForm />
    </AuthCard>
  );
}
