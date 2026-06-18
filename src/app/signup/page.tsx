import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <AuthCard
      eyebrow="Invitation Required"
      title="Create account"
      subtitle="This is the invite-ready signup shell. The full qualification flow lands in the membership-policy module."
    >
      <SignupForm />
    </AuthCard>
  );
}
