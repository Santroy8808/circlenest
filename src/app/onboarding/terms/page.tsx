import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OnboardingTermsForm } from "@/components/onboarding/onboarding-forms";
import { currentTermsSummary } from "@/modules/legal/terms";
import { getOnboardingState } from "@/modules/onboarding/onboarding.service";

export default async function OnboardingTermsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/onboarding/terms");
  }

  const state = await getOnboardingState(session.user.id);

  if (!state) {
    redirect("/login?callbackUrl=/onboarding/terms");
  }

  if (state.user.goodStandingDeniedAt) {
    redirect("/onboarding/application-complete");
  }

  if (!state.hasGoodStanding) {
    redirect(state.nextPath ?? "/onboarding/profile");
  }

  if (state.completed) {
    redirect("/home");
  }

  const terms = currentTermsSummary();

  return (
    <OnboardingTermsForm
      defaultEmail={state.user.email}
      defaultName={state.user.profile?.displayName ?? ""}
      effectiveDateLabel={terms.effectiveDateLabel}
      termsHref={terms.pagePath}
      termsPdfHref={terms.pdfPath}
      termsVersion={terms.version}
    />
  );
}
