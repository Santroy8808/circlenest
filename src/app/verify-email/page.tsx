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
      title="Verify your email"
      subtitle="Confirm your email address to finish securing your invited account."
    >
      <EmailVerificationForm initialToken={searchParams?.token} />
    </AuthCard>
  );
}
