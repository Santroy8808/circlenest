import { ScientologyClassification } from "@prisma/client";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OnboardingScientologyForm } from "@/components/onboarding/onboarding-forms";
import { getOnboardingState } from "@/modules/onboarding/onboarding.service";

export default async function OnboardingScientologyPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/onboarding/scientology");
  }

  const state = await getOnboardingState(session.user.id);

  if (!state) {
    redirect("/login?callbackUrl=/onboarding/scientology");
  }

  if (state.user.goodStandingDeniedAt) {
    redirect("/onboarding/application-complete");
  }

  if (!state.profileStepDone) {
    redirect("/onboarding/profile");
  }

  if (state.scientologyStepDone && state.nextPath && state.nextPath !== "/onboarding/scientology") {
    redirect(state.nextPath);
  }

  return (
    <OnboardingScientologyForm
      defaults={{
        classification: state.user.scientologyProfile?.classification ?? ScientologyClassification.PUBLIC,
        orgName: state.user.scientologyProfile?.orgName ?? "",
        lastServiceName: state.user.scientologyProfile?.lastServiceName ?? "",
        iasMembershipLast6: state.user.scientologyProfile?.iasMembershipLast6 ?? "",
        trainingLevel: state.user.scientologyProfile?.trainingLevel ?? "",
        processingStatus: state.user.scientologyProfile?.processingStatus ?? "",
        educationNotes: state.user.scientologyProfile?.educationNotes ?? ""
      }}
    />
  );
}
