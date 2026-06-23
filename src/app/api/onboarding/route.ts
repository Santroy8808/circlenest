import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  acceptOnboardingTerms,
  saveGoodStandingAttestation,
  saveOnboardingProfile,
  saveOnboardingScientology,
  skipOnboardingProfile,
  skipOnboardingScientology
} from "@/modules/onboarding/onboarding.service";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { step?: string } | null;
  const result =
    body?.step === "profile"
      ? await saveOnboardingProfile(session.user.id, body)
      : body?.step === "profile-skip"
        ? await skipOnboardingProfile(session.user.id)
      : body?.step === "scientology"
        ? await saveOnboardingScientology(session.user.id, body)
        : body?.step === "scientology-skip"
          ? await skipOnboardingScientology(session.user.id)
          : body?.step === "good-standing"
            ? await saveGoodStandingAttestation(session.user.id, body)
            : body?.step === "terms"
              ? await acceptOnboardingTerms(session.user.id, body)
              : { ok: false as const, error: "Unknown onboarding step." };

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
