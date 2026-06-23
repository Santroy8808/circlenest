import { ScientologyClassification, ScientologyVisibility } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { scientologyProcessingStatuses, scientologyTrainingLevels } from "@/modules/my-scientology/types";

const MODULE_KEY = "onboarding";

export const onboardingProfileSchema = z.object({
  displayName: z.string().min(1, "Full name is required.").max(80),
  tagline: z.string().max(140).optional().or(z.literal("")),
  bio: z.string().max(2000).optional().or(z.literal("")),
  location: z.string().min(1, "Location is required.").max(120)
});

export const onboardingScientologySchema = z.object({
  classification: z.nativeEnum(ScientologyClassification).default(ScientologyClassification.PUBLIC),
  orgName: z.string().min(1, "Current org is required.").max(160),
  lastServiceName: z.string().min(1, "Last service is required.").max(160),
  iasMembershipLast6: z.string().regex(/^\d{6}$/, "IAS membership last 6 must be exactly 6 digits.").optional().or(z.literal("")),
  trainingLevel: z.enum(scientologyTrainingLevels).optional().default(""),
  processingStatus: z.enum(scientologyProcessingStatuses).optional().default(""),
  educationNotes: z.string().max(4000).optional().or(z.literal(""))
});

export const goodStandingSchema = z.object({
  isInGoodStanding: z.boolean()
});

export const termsSchema = z.object({
  accepted: z.literal(true, {
    errorMap: () => ({ message: "Terms must be accepted." })
  })
});

export async function getOnboardingState(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      username: true,
      onboardingCompletedAt: true,
      profileOnboardingSkippedAt: true,
      scientologyOnboardingSkippedAt: true,
      termsAcceptedAt: true,
      goodStandingDeniedAt: true,
      profile: {
        select: {
          displayName: true,
          tagline: true,
          bio: true,
          location: true
        }
      },
      scientologyProfile: {
        select: {
          classification: true,
          orgName: true,
          lastServiceName: true,
          iasMembershipLast6: true,
          trainingLevel: true,
          processingStatus: true,
          goodStandingAttested: true,
          educationNotes: true
        }
      }
    }
  });

  if (!user) return null;

  const hasProfile = Boolean(user.profile?.displayName?.trim() && user.profile.location?.trim());
  const hasScientology = Boolean(user.scientologyProfile?.orgName?.trim() && user.scientologyProfile.lastServiceName?.trim());
  const profileStepDone = hasProfile || Boolean(user.profileOnboardingSkippedAt);
  const scientologyStepDone = hasScientology || Boolean(user.scientologyOnboardingSkippedAt);
  const hasGoodStanding = Boolean(user.scientologyProfile?.goodStandingAttested);
  const hasTerms = Boolean(user.termsAcceptedAt);
  const completed = Boolean(user.onboardingCompletedAt && hasGoodStanding && hasTerms);

  return {
    user,
    hasProfile,
    hasScientology,
    profileStepDone,
    scientologyStepDone,
    hasGoodStanding,
    hasTerms,
    completed,
    nextPath: user.goodStandingDeniedAt
      ? "/onboarding/application-complete"
      : !profileStepDone
        ? "/onboarding/profile"
        : !scientologyStepDone
          ? "/onboarding/scientology"
          : !hasGoodStanding
            ? "/onboarding/good-standing"
            : !hasTerms
              ? "/onboarding/terms"
              : null
  };
}

export async function saveOnboardingProfile(userId: string, input: unknown) {
  const parsed = onboardingProfileSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid profile." };
  }

  await prisma.profile.upsert({
    where: { userId },
    update: {
      displayName: parsed.data.displayName,
      tagline: parsed.data.tagline || null,
      bio: parsed.data.bio || null,
      location: parsed.data.location
    },
    create: {
      userId,
      displayName: parsed.data.displayName,
      tagline: parsed.data.tagline || null,
      bio: parsed.data.bio || null,
      location: parsed.data.location
    }
  });

  await diagnostics.info(MODULE_KEY, "Onboarding profile step completed.", { userId });

  return { ok: true as const, nextPath: "/onboarding/scientology" };
}

export async function skipOnboardingProfile(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { profileOnboardingSkippedAt: new Date() }
  });

  await diagnostics.info(MODULE_KEY, "Onboarding profile step skipped.", { userId });

  return { ok: true as const, nextPath: "/onboarding/scientology" };
}

export async function saveOnboardingScientology(userId: string, input: unknown) {
  const parsed = onboardingScientologySchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid My Scientology step." };
  }

  await prisma.scientologyProfile.upsert({
    where: { userId },
    update: {
      classification: parsed.data.classification,
      orgName: parsed.data.orgName,
      lastServiceName: parsed.data.lastServiceName,
      iasMembershipLast6: parsed.data.iasMembershipLast6 || null,
      trainingLevel: parsed.data.trainingLevel || null,
      processingStatus: parsed.data.processingStatus || null,
      educationNotes: parsed.data.educationNotes || null,
      visibility: ScientologyVisibility.PRIVATE
    },
    create: {
      userId,
      classification: parsed.data.classification,
      orgName: parsed.data.orgName,
      lastServiceName: parsed.data.lastServiceName,
      iasMembershipLast6: parsed.data.iasMembershipLast6 || null,
      trainingLevel: parsed.data.trainingLevel || null,
      processingStatus: parsed.data.processingStatus || null,
      educationNotes: parsed.data.educationNotes || null,
      visibility: ScientologyVisibility.PRIVATE
    }
  });

  await diagnostics.info(MODULE_KEY, "Onboarding Scientology step completed.", { userId });

  return { ok: true as const, nextPath: "/onboarding/good-standing" };
}

export async function skipOnboardingScientology(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { scientologyOnboardingSkippedAt: new Date() }
  });

  await diagnostics.info(MODULE_KEY, "Onboarding Scientology step skipped.", { userId });

  return { ok: true as const, nextPath: "/onboarding/good-standing" };
}

export async function saveGoodStandingAttestation(userId: string, input: unknown) {
  const parsed = goodStandingSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: "Choose yes or no." };
  }

  if (!parsed.data.isInGoodStanding) {
    await prisma.user.update({
      where: { id: userId },
      data: { goodStandingDeniedAt: new Date() }
    });

    await diagnostics.info(MODULE_KEY, "Onboarding ended after good-standing denial.", { userId });

    return { ok: true as const, nextPath: "/onboarding/application-complete" };
  }

  await prisma.scientologyProfile.upsert({
    where: { userId },
    update: {
      goodStandingAttested: true,
      goodStandingUpdatedAt: new Date()
    },
    create: {
      userId,
      classification: ScientologyClassification.PUBLIC,
      visibility: ScientologyVisibility.PRIVATE,
      goodStandingAttested: true,
      goodStandingUpdatedAt: new Date()
    }
  });

  await diagnostics.info(MODULE_KEY, "Onboarding good-standing step completed.", { userId });

  return { ok: true as const, nextPath: "/onboarding/terms" };
}

export async function acceptOnboardingTerms(userId: string, input: unknown) {
  const parsed = termsSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Terms must be accepted." };
  }

  const state = await getOnboardingState(userId);

  if (!state || state.user.goodStandingDeniedAt) {
    return { ok: false as const, error: "Application is not eligible for activation." };
  }

  if (!state.hasGoodStanding) {
    return { ok: false as const, error: "Complete the previous onboarding steps first." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      termsAcceptedAt: new Date(),
      onboardingCompletedAt: new Date()
    }
  });

  await diagnostics.info(MODULE_KEY, "Onboarding completed.", { userId });

  return { ok: true as const, nextPath: "/home" };
}
