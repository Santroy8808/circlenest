import { ProfileVisibility } from "@prisma/client";
import { z } from "zod";

const optionalText = z.string().max(4000).optional().or(z.literal(""));
const shortText = z.string().max(240).optional().or(z.literal(""));
const urlText = z.string().url("Enter a valid URL.").optional().or(z.literal(""));
const allowedResumeMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

export const MAX_RESUME_UPLOAD_BYTES = 12 * 1024 * 1024;

export const resumeExperienceSchema = z.object({
  title: z.string().max(160).optional().or(z.literal("")),
  organization: z.string().max(160).optional().or(z.literal("")),
  location: z.string().max(160).optional().or(z.literal("")),
  dates: z.string().max(120).optional().or(z.literal("")),
  bullets: z.array(z.string().max(280)).max(8).default([])
});

export const resumeEducationSchema = z.object({
  credential: z.string().max(180).optional().or(z.literal("")),
  institution: z.string().max(180).optional().or(z.literal("")),
  dates: z.string().max(120).optional().or(z.literal("")),
  details: z.string().max(500).optional().or(z.literal(""))
});

const stringList = z.array(z.string().min(1).max(180)).max(40).default([]);

export const updateResumeSchema = z.object({
  headline: shortText,
  executiveSummary: optionalText,
  email: z.string().email("Enter a valid email.").optional().or(z.literal("")),
  phone: shortText,
  location: shortText,
  website: urlText,
  coreSkills: stringList,
  experience: z.array(resumeExperienceSchema).max(8).default([]),
  education: z.array(resumeEducationSchema).max(6).default([]),
  credentials: stringList,
  achievements: stringList,
  additionalNotes: optionalText,
  includeScientology: z.boolean().default(false),
  visibility: z.nativeEnum(ProfileVisibility).default(ProfileVisibility.MEMBERS),
  uploadedResumeUrl: urlText,
  uploadedResumeName: shortText
});

const resumeUploadBaseSchema = z.object({
  fileName: z.string().min(1).max(240),
  mimeType: z.string().min(1).max(140).refine((value) => allowedResumeMimeTypes.has(value), {
    message: "Upload a PDF, DOC, or DOCX resume."
  }),
  sizeBytes: z.number().int().positive().max(MAX_RESUME_UPLOAD_BYTES)
});

export const createResumeUploadIntentSchema = resumeUploadBaseSchema;

export const completeResumeUploadSchema = resumeUploadBaseSchema.extend({
  storageKey: z.string().min(1).max(600)
});

export type ResumeExperience = z.infer<typeof resumeExperienceSchema>;
export type ResumeEducation = z.infer<typeof resumeEducationSchema>;
export type ResumeUpdateInput = z.infer<typeof updateResumeSchema>;
export type ResumeUploadIntentInput = z.infer<typeof createResumeUploadIntentSchema>;

export type ResumeView = ResumeUpdateInput & {
  id: string;
  updatedAt: string;
};
