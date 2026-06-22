import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <AuthCard
      eyebrow="Invitation Required"
      title="Create account"
      subtitle="Use the one-time invite code you received to create your Theta-Space account."
    >
      <SignupForm />
    </AuthCard>
  );
}
