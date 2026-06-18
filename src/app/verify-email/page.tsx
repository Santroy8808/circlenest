import { AuthCard } from "@/components/auth/auth-card";
import { EmailVerificationForm } from "@/components/auth/email-verification-form";

export default function VerifyEmailPage() {
  return (
    <AuthCard
      eyebrow="Verification"
      title="Verify email"
      subtitle="Email verification is token-backed now, with production email templates planned later."
    >
      <EmailVerificationForm />
    </AuthCard>
  );
}
