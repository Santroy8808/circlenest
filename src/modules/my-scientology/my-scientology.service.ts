import { randomBytes } from "crypto";
import { MediaVisibility, ScientologyVisibility } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { createPresignedR2PutUrl, verifyR2Object } from "@/lib/platform/r2";
import {
  completeScientologyCommendationUploadSchema,
  createScientologyCommendationUploadIntentSchema,
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

function safeFileName(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
  return cleaned || "commendation";
}

function dateSlug(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export async function getScientologyProfileForOwner(userId: string) {
  try {
    return await withDbTimeout(
      prisma.scientologyProfile.findUnique({
        where: { userId },
        include: {
          commendations: {
            include: { mediaAsset: true },
            orderBy: { createdAt: "desc" }
          }
        }
      }),
      "scientology profile lookup"
    );
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
      iasMembershipLast6: parsed.data.iasMembershipLast6 || null,
      trainingLevel: parsed.data.trainingLevel || null,
      processingStatus: parsed.data.processingStatus || null,
      courseCompletions: parsed.data.courseCompletions,
      introServices: parsed.data.introServices,
      technicalCourses: parsed.data.technicalCourses,
      specialistCourses: parsed.data.specialistCourses,
      additionalProcessing: parsed.data.additionalProcessing,
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
      iasMembershipLast6: parsed.data.iasMembershipLast6 || null,
      trainingLevel: parsed.data.trainingLevel || null,
      processingStatus: parsed.data.processingStatus || null,
      courseCompletions: parsed.data.courseCompletions,
      introServices: parsed.data.introServices,
      technicalCourses: parsed.data.technicalCourses,
      specialistCourses: parsed.data.specialistCourses,
      additionalProcessing: parsed.data.additionalProcessing,
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

export async function createScientologyCommendationUploadIntent(userId: string, input: unknown) {
  const parsed = createScientologyCommendationUploadIntentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid commendation upload." };
  }

  const storageKey = [
    "users",
    userId,
    "my-scientology",
    "commendations",
    dateSlug(),
    `${randomBytes(8).toString("hex")}-${safeFileName(parsed.data.fileName)}`
  ].join("/");

  try {
    const uploadUrl = await createPresignedR2PutUrl({
      storageKey,
      mimeType: parsed.data.mimeType,
      sizeBytes: parsed.data.sizeBytes,
      access: "private"
    });

    return {
      ok: true as const,
      uploadUrl,
      storageKey,
      publicUrl: null,
      expiresInSeconds: 300
    };
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not create commendation upload intent.", {
      userId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { ok: false as const, error: "Media storage is not configured." };
  }
}

export async function completeScientologyCommendationUpload(userId: string, input: unknown) {
  const parsed = completeScientologyCommendationUploadSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid commendation upload completion." };
  }

  if (parsed.data.mimeType === "application/pdf" && !parsed.data.isFlattenedPdf) {
    return { ok: false as const, error: "PDF commendations must be flattened and not encrypted before upload." };
  }

  const expectedPrefix = ["users", userId, "my-scientology", "commendations"].join("/") + "/";
  if (!parsed.data.storageKey.startsWith(expectedPrefix)) {
    return { ok: false as const, error: "Invalid commendation upload key." };
  }

  const uploadedObject = await verifyR2Object({
    storageKey: parsed.data.storageKey,
    expectedMimeType: parsed.data.mimeType,
    expectedSizeBytes: parsed.data.sizeBytes,
    access: "private",
    label: "Commendation upload"
  });

  if (!uploadedObject.ok) {
    return { ok: false as const, error: uploadedObject.error };
  }

  const result = await prisma.$transaction(async (tx) => {
    const profile = await tx.scientologyProfile.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        classification: "PUBLIC",
        visibility: ScientologyVisibility.PRIVATE
      }
    });
    const asset = await tx.mediaAsset.create({
      data: {
        ownerUserId: userId,
        storageKey: parsed.data.storageKey,
        publicUrl: null,
        mimeType: parsed.data.mimeType,
        sizeBytes: BigInt(parsed.data.sizeBytes),
        originalName: parsed.data.fileName,
        visibility: MediaVisibility.PRIVATE,
        metadata: {
          source: "my-scientology-commendation",
          flattenedPdf: parsed.data.isFlattenedPdf
        }
      }
    });
    const commendation = await tx.scientologyCommendation.create({
      data: {
        scientologyProfileId: profile.id,
        mediaAssetId: asset.id,
        title: parsed.data.title || parsed.data.fileName,
        isFlattenedPdf: parsed.data.isFlattenedPdf
      },
      include: { mediaAsset: true }
    });

    return commendation;
  });

  await diagnostics.info(MODULE_KEY, "Scientology commendation uploaded.", {
    userId,
    mediaAssetId: result.mediaAssetId,
    mimeType: result.mediaAsset.mimeType
  });

  return { ok: true as const, commendation: result };
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
