import { AuthCard } from "@/components/auth/auth-card";
import { EmailVerificationForm } from "@/components/auth/email-verification-form";

export default function VerifyEmailPage({
  searchParams
}: {
  searchParams?: { token?: string };
}) {
  return (
    <AuthCard
      eyebrow="Verification"
      title="Verify email"
      subtitle="Enter the verification token from your Theta-Space email."
    >
      <EmailVerificationForm initialToken={searchParams?.token} />
    </AuthCard>
  );
}
