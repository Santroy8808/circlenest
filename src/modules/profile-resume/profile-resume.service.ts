import { randomBytes } from "crypto";
import { MediaAssetStatus, MediaVisibility, ProfileVisibility, ScientologyVisibility, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { createPresignedR2PutUrl, verifyR2Object } from "@/lib/platform/r2";
import { parseScientologySelections } from "@/modules/my-scientology/types";
import {
  completeResumeUploadSchema,
  createResumeUploadIntentSchema,
  updateResumeSchema,
  type ResumeEducation,
  type ResumeExperience,
  type ResumeView
} from "@/modules/profile-resume/types";

const MODULE_KEY = "profile-resume";
const DB_TIMEOUT_MS = 2500;

function withResumeDbTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${operation} timed out`)), DB_TIMEOUT_MS);
    })
  ]);
}

function dateSlug(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function safeFileName(fileName: string) {
  return fileName
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 140) || "resume";
}

function asStringList(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isJsonObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function jsonString(record: Prisma.JsonObject, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function asExperienceList(value: Prisma.JsonValue | null | undefined): ResumeExperience[] {
  return Array.isArray(value)
    ? value
        .filter(isJsonObject)
        .map((item) => ({
          title: jsonString(item, "title"),
          organization: jsonString(item, "organization"),
          location: jsonString(item, "location"),
          dates: jsonString(item, "dates"),
          bullets: Array.isArray(item.bullets) ? item.bullets.filter((bullet): bullet is string => typeof bullet === "string") : []
        }))
    : [];
}

function asEducationList(value: Prisma.JsonValue | null | undefined): ResumeEducation[] {
  return Array.isArray(value)
    ? value
        .filter(isJsonObject)
        .map((item) => ({
          credential: jsonString(item, "credential"),
          institution: jsonString(item, "institution"),
          dates: jsonString(item, "dates"),
          details: jsonString(item, "details")
        }))
    : [];
}

function canViewVisibility(visibility: ProfileVisibility, isOwner: boolean) {
  return isOwner || visibility === ProfileVisibility.PUBLIC || visibility === ProfileVisibility.MEMBERS;
}

function toResumeView(resume: {
  id: string;
  headline: string | null;
  executiveSummary: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  website: string | null;
  coreSkills: Prisma.JsonValue | null;
  experience: Prisma.JsonValue | null;
  education: Prisma.JsonValue | null;
  credentials: Prisma.JsonValue | null;
  achievements: Prisma.JsonValue | null;
  additionalNotes: string | null;
  includeScientology: boolean;
  visibility: ProfileVisibility;
  uploadedResumeUrl: string | null;
  uploadedResumeName: string | null;
  updatedAt: Date;
}): ResumeView {
  return {
    id: resume.id,
    headline: resume.headline ?? "",
    executiveSummary: resume.executiveSummary ?? "",
    email: resume.email ?? "",
    phone: resume.phone ?? "",
    location: resume.location ?? "",
    website: resume.website ?? "",
    coreSkills: asStringList(resume.coreSkills),
    experience: asExperienceList(resume.experience),
    education: asEducationList(resume.education),
    credentials: asStringList(resume.credentials),
    achievements: asStringList(resume.achievements),
    additionalNotes: resume.additionalNotes ?? "",
    includeScientology: resume.includeScientology,
    visibility: resume.visibility,
    uploadedResumeUrl: resume.uploadedResumeUrl ?? "",
    uploadedResumeName: resume.uploadedResumeName ?? "",
    updatedAt: resume.updatedAt.toISOString()
  };
}

export async function getResumeForOwner(userId: string) {
  const resume = await withResumeDbTimeout(prisma.userResume.findUnique({ where: { userId } }), "owner resume lookup");
  return resume ? toResumeView(resume) : null;
}

export async function updateResume(userId: string, input: unknown) {
  const parsed = updateResumeSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid resume." };
  }

  const resume = await prisma.userResume.upsert({
    where: { userId },
    update: {
      headline: parsed.data.headline || null,
      executiveSummary: parsed.data.executiveSummary || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      location: parsed.data.location || null,
      website: parsed.data.website || null,
      coreSkills: parsed.data.coreSkills,
      experience: parsed.data.experience,
      education: parsed.data.education,
      credentials: parsed.data.credentials,
      achievements: parsed.data.achievements,
      additionalNotes: parsed.data.additionalNotes || null,
      includeScientology: parsed.data.includeScientology,
      visibility: parsed.data.visibility
    },
    create: {
      userId,
      headline: parsed.data.headline || null,
      executiveSummary: parsed.data.executiveSummary || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      location: parsed.data.location || null,
      website: parsed.data.website || null,
      coreSkills: parsed.data.coreSkills,
      experience: parsed.data.experience,
      education: parsed.data.education,
      credentials: parsed.data.credentials,
      achievements: parsed.data.achievements,
      additionalNotes: parsed.data.additionalNotes || null,
      includeScientology: parsed.data.includeScientology,
      visibility: parsed.data.visibility
    }
  });

  await diagnostics.info(MODULE_KEY, "Resume updated.", {
    userId,
    visibility: resume.visibility,
    includeScientology: resume.includeScientology
  });

  return { ok: true as const, resume: toResumeView(resume) };
}

export async function createResumeUploadIntent(userId: string, input: unknown) {
  const parsed = createResumeUploadIntentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid resume upload." };
  }

  const storageKey = [
    "users",
    userId,
    "resume",
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
    await diagnostics.error(MODULE_KEY, "Could not create resume upload intent.", {
      userId,
      error: error instanceof Error ? error.message : String(error)
    });
    return { ok: false as const, error: "Resume upload is not available right now." };
  }
}

export async function completeResumeUpload(userId: string, input: unknown) {
  const parsed = completeResumeUploadSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid resume upload." };
  }

  const expectedPrefix = ["users", userId, "resume"].join("/") + "/";
  if (!parsed.data.storageKey.startsWith(expectedPrefix)) {
    return { ok: false as const, error: "Invalid resume upload key." };
  }

  const uploadedObject = await verifyR2Object({
    storageKey: parsed.data.storageKey,
    expectedMimeType: parsed.data.mimeType,
    expectedSizeBytes: parsed.data.sizeBytes,
    access: "private",
    label: "Resume upload"
  });

  if (!uploadedObject.ok) {
    return { ok: false as const, error: uploadedObject.error };
  }

  const { asset, resume } = await prisma.$transaction(async (tx) => {
    const savedAsset = await tx.mediaAsset.upsert({
      where: { storageKey: parsed.data.storageKey },
      update: {
        publicUrl: null,
        mimeType: parsed.data.mimeType,
        sizeBytes: BigInt(parsed.data.sizeBytes),
        originalName: parsed.data.fileName,
        status: MediaAssetStatus.READY,
        visibility: MediaVisibility.PRIVATE
      },
      create: {
        ownerUserId: userId,
        storageKey: parsed.data.storageKey,
        publicUrl: null,
        mimeType: parsed.data.mimeType,
        sizeBytes: BigInt(parsed.data.sizeBytes),
        originalName: parsed.data.fileName,
        status: MediaAssetStatus.READY,
        visibility: MediaVisibility.PRIVATE,
        metadata: { module: MODULE_KEY, purpose: "resume" }
      }
    });
    if (savedAsset.ownerUserId !== userId) throw new Error("Resume upload owner mismatch.");

    const savedResume = await tx.userResume.upsert({
      where: { userId },
      update: {
        uploadedResumeUrl: `/api/media/assets/${savedAsset.id}`,
        uploadedResumeName: parsed.data.fileName
      },
      create: {
        userId,
        uploadedResumeUrl: `/api/media/assets/${savedAsset.id}`,
        uploadedResumeName: parsed.data.fileName
      }
    });

    return { asset: savedAsset, resume: savedResume };
  });

  const privateUrl = `/api/media/assets/${asset.id}`;

  await diagnostics.info(MODULE_KEY, "Resume file uploaded.", {
    userId,
    storageKey: parsed.data.storageKey
  });

  return {
    ok: true as const,
    resume: toResumeView(resume),
    uploadedResumeUrl: privateUrl,
    uploadedResumeName: parsed.data.fileName
  };
}

export async function getPublicResumeByUsername(username: string, viewerUserId: string) {
  const user = await withResumeDbTimeout(
    prisma.user.findUnique({
      where: { username: username.trim().replace(/^@/, "").toLowerCase() },
      include: {
        profile: true,
        resume: true,
        scientologyProfile: true
      }
    }),
    "public resume lookup"
  );

  if (!user || user.deactivatedAt || !user.resume) return null;

  const isOwner = user.id === viewerUserId;
  if (!canViewVisibility(user.resume.visibility, isOwner)) return null;

  const scientologyVisible =
    user.resume.includeScientology &&
    user.scientologyProfile?.visibility === ScientologyVisibility.MEMBERS &&
    canViewVisibility(user.resume.visibility, isOwner);

  return {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.profile?.displayName ?? user.username,
      avatarUrl: user.profile?.avatarUrl,
      tagline: user.profile?.tagline,
      bio: user.profile?.bio
    },
    resume: toResumeView(user.resume),
    scientology: scientologyVisible && user.scientologyProfile
      ? {
          classification: user.scientologyProfile.classification,
          orgName: user.scientologyProfile.orgName,
          lastServiceName: user.scientologyProfile.lastServiceName,
          trainingLevel: user.scientologyProfile.trainingLevel,
          processingStatus: user.scientologyProfile.processingStatus,
          educationNotes: user.scientologyProfile.educationNotes,
          selections: parseScientologySelections(user.scientologyProfile)
        }
      : null
  };
}
