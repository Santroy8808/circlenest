import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OnboardingProfileForm } from "@/components/onboarding/onboarding-forms";
import { getOnboardingState } from "@/modules/onboarding/onboarding.service";

export default async function OnboardingProfilePage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/onboarding/profile");
  }

  const state = await getOnboardingState(session.user.id);

  if (!state) {
    redirect("/login?callbackUrl=/onboarding/profile");
  }

  if (state.user.goodStandingDeniedAt) {
    redirect("/onboarding/application-complete");
  }

  if (state.profileStepDone && state.nextPath && state.nextPath !== "/onboarding/profile") {
    redirect(state.nextPath);
  }

  return (
    <OnboardingProfileForm
      defaults={{
        email: state.user.email,
        displayName: state.user.profile?.displayName ?? session.user.name ?? state.user.username,
        tagline: state.user.profile?.tagline ?? "",
        bio: state.user.profile?.bio ?? "",
        location: state.user.profile?.location ?? ""
      }}
    />
  );
}
