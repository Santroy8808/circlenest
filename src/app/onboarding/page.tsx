import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getOnboardingState } from "@/modules/onboarding/onboarding.service";

export default async function OnboardingIndexPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/onboarding");
  }

  const state = await getOnboardingState(session.user.id);

  redirect(state?.nextPath ?? "/home");
}
