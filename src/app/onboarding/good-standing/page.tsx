import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OnboardingGoodStandingForm } from "@/components/onboarding/onboarding-forms";
import { getOnboardingState } from "@/modules/onboarding/onboarding.service";

export default async function OnboardingGoodStandingPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/onboarding/good-standing");
  }

  const state = await getOnboardingState(session.user.id);

  if (!state) {
    redirect("/login?callbackUrl=/onboarding/good-standing");
  }

  if (state.user.goodStandingDeniedAt) {
    redirect("/onboarding/application-complete");
  }

  if (!state.profileStepDone || !state.scientologyStepDone) {
    redirect(state.nextPath ?? "/onboarding/profile");
  }

  if (state.hasGoodStanding && state.nextPath && state.nextPath !== "/onboarding/good-standing") {
    redirect(state.nextPath);
  }

  return <OnboardingGoodStandingForm />;
}
