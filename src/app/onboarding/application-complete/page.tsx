import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OnboardingApplicationComplete } from "@/components/onboarding/onboarding-forms";

export default async function OnboardingApplicationCompletePage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/onboarding/application-complete");
  }

  return <OnboardingApplicationComplete />;
}
