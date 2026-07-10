import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <AuthCard
      eyebrow="Invite-only access"
      title="Create your invited account"
      subtitle="You need a valid one-time invitation code. Account creation is not open to the public."
    >
      <SignupForm />
    </AuthCard>
  );
}
