import { AuthCard } from "@/components/auth/auth-card";
import { EmailVerificationForm } from "@/components/auth/email-verification-form";

export default function VerifyEmailPage() {
  return (
    <AuthCard
      eyebrow="Verification"
      title="Verify email"
      subtitle="Enter the verification token from your Theta-Space email."
    >
      <EmailVerificationForm />
    </AuthCard>
  );
}
