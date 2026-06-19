import { ScientologyVisibility } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import {
  type ScientologyPublicSummary,
  updateScientologyProfileSchema
} from "@/modules/my-scientology/types";

const MODULE_KEY = "my-scientology";
const DB_TIMEOUT_MS = 2500;

function withDbTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${operation} timed out`)), DB_TIMEOUT_MS);
    })
  ]);
}

function parseServiceDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function getScientologyProfileForOwner(userId: string) {
  try {
    return await withDbTimeout(prisma.scientologyProfile.findUnique({ where: { userId } }), "scientology profile lookup");
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not load owner Scientology profile.", {
      userId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return null;
  }
}

export async function updateScientologyProfile(userId: string, input: unknown) {
  const parsed = updateScientologyProfileSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid Scientology profile." };
  }

  const profile = await prisma.scientologyProfile.upsert({
    where: { userId },
    update: {
      classification: parsed.data.classification,
      orgName: parsed.data.orgName || null,
      lastServiceName: parsed.data.lastServiceName || null,
      lastServiceAt: parseServiceDate(parsed.data.lastServiceAt),
      trainingLevel: parsed.data.trainingLevel || null,
      processingStatus: parsed.data.processingStatus || null,
      goodStandingAttested: parsed.data.goodStandingAttested,
      goodStandingUpdatedAt: parsed.data.goodStandingAttested ? new Date() : null,
      educationNotes: parsed.data.educationNotes || null,
      visibility: parsed.data.visibility
    },
    create: {
      userId,
      classification: parsed.data.classification,
      orgName: parsed.data.orgName || null,
      lastServiceName: parsed.data.lastServiceName || null,
      lastServiceAt: parseServiceDate(parsed.data.lastServiceAt),
      trainingLevel: parsed.data.trainingLevel || null,
      processingStatus: parsed.data.processingStatus || null,
      goodStandingAttested: parsed.data.goodStandingAttested,
      goodStandingUpdatedAt: parsed.data.goodStandingAttested ? new Date() : null,
      educationNotes: parsed.data.educationNotes || null,
      visibility: parsed.data.visibility
    }
  });

  await diagnostics.info(MODULE_KEY, "Scientology profile updated.", {
    userId,
    visibility: profile.visibility
  });

  return { ok: true as const, profile };
}

export function toPublicScientologySummary(profile: {
  classification: ScientologyPublicSummary["classification"];
  trainingLevel: string | null;
  processingStatus: string | null;
  visibility: ScientologyVisibility;
} | null): ScientologyPublicSummary {
  if (!profile || profile.visibility !== ScientologyVisibility.MEMBERS) {
    return {
      classification: "PUBLIC",
      visible: false
    };
  }

  return {
    classification: profile.classification,
    trainingLevel: profile.trainingLevel,
    processingStatus: profile.processingStatus,
    visible: true
  };
}
