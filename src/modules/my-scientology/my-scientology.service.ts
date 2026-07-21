import { MediaAssetStatus, MediaVisibility, ScientologyVisibility, UploadIntentPurpose } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { withMediaAssetReferenceValidation } from "@/lib/platform/media-asset-reference-fence";
import {
  completeUploadIntent,
  consumeVerifiedUploadIntent,
  createUploadIntent
} from "@/modules/media/upload-intent.service";
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

  const intent = await createUploadIntent(userId, {
    purpose: UploadIntentPurpose.PROFILE_MEDIA,
    mimeType: parsed.data.mimeType,
    sizeBytes: parsed.data.sizeBytes,
    visibility: MediaVisibility.PRIVATE
  });
  if (!intent.ok) return intent;

  return {
    ok: true as const,
    intentId: intent.intent.id,
    uploadUrl: intent.uploadUrl,
    uploadHeaders: intent.uploadHeaders,
    storageKey: intent.intent.storageKey,
    publicUrl: null,
    expiresInSeconds: intent.expiresInSeconds
  };
}

export async function completeScientologyCommendationUpload(userId: string, input: unknown) {
  const parsed = completeScientologyCommendationUploadSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid commendation upload completion." };
  }

  if (parsed.data.mimeType === "application/pdf" && !parsed.data.isFlattenedPdf) {
    return { ok: false as const, error: "PDF commendations must be flattened and not encrypted before upload." };
  }

  const verified = await completeUploadIntent(userId, { intentId: parsed.data.intentId });
  if (!verified.ok) return verified;
  if (
    verified.intent.purpose !== UploadIntentPurpose.PROFILE_MEDIA ||
    verified.intent.storageKey !== parsed.data.storageKey ||
    verified.intent.mimeType !== parsed.data.mimeType ||
    verified.intent.sizeBytes !== String(parsed.data.sizeBytes) ||
    verified.intent.visibility !== MediaVisibility.PRIVATE
  ) {
    return { ok: false as const, error: "Upload intent does not match this commendation." };
  }

  const completion = await withMediaAssetReferenceValidation(() =>
    consumeVerifiedUploadIntent({
      ownerUserId: userId,
      intentId: parsed.data.intentId,
      purpose: UploadIntentPurpose.PROFILE_MEDIA,
      consume: async (transaction, intent) => {
      const profile = await transaction.scientologyProfile.upsert({
        where: { userId },
        update: {},
        create: {
          userId,
          classification: "PUBLIC",
          visibility: ScientologyVisibility.PRIVATE
        }
      });
      const asset = await transaction.mediaAsset.create({
        data: {
          ownerUserId: userId,
          storageKey: intent.storageKey,
          publicUrl: null,
          mimeType: parsed.data.mimeType,
          sizeBytes: intent.declaredSizeBytes,
          originalName: parsed.data.fileName,
          status: MediaAssetStatus.READY,
          visibility: MediaVisibility.PRIVATE,
          metadata: {
            source: "my-scientology-commendation",
            flattenedPdf: parsed.data.isFlattenedPdf,
            uploadIntentId: intent.id
          }
        }
      });
      const commendation = await transaction.scientologyCommendation.create({
        data: {
          scientologyProfileId: profile.id,
          mediaAssetId: asset.id,
          title: parsed.data.title || parsed.data.fileName,
          isFlattenedPdf: parsed.data.isFlattenedPdf
        },
        include: { mediaAsset: true }
      });

      return commendation;
      }
    })
  );
  if (!completion.ok) return completion;
  const consumed = completion.value;
  if (!consumed.ok) return consumed;
  const result = consumed.value;

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
