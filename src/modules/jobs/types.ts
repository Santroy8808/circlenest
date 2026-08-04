import { JobCategory, JobEmploymentType, JobListingStatus } from "@prisma/client";
import { z } from "zod";

export const jobCategoryLabels: Record<JobCategory, string> = {
  [JobCategory.ADMINISTRATION]: "Administration",
  [JobCategory.TECHNICAL]: "Technical",
  [JobCategory.SALES]: "Sales",
  [JobCategory.DELIVERY]: "Delivery",
  [JobCategory.AUDITING]: "Auditing",
  [JobCategory.TRAINING]: "Training",
  [JobCategory.CREATIVE]: "Creative",
  [JobCategory.PROFESSIONAL_SERVICES]: "Professional Services",
  [JobCategory.OTHER]: "Other"
};

export const hiddenJobSearchCategories = new Set<JobCategory>([
  JobCategory.AUDITING,
  JobCategory.TRAINING
]);

export const jobCategoryOptions = (Object.values(JobCategory) as JobCategory[])
  .filter((value) => !hiddenJobSearchCategories.has(value))
  .map((value) => ({
    value,
    label: jobCategoryLabels[value]
  }));

export function isJobSearchCategory(value?: string | null): value is JobCategory {
  return Boolean(value && value in JobCategory && !hiddenJobSearchCategories.has(value as JobCategory));
}

export const employmentTypeLabels: Record<JobEmploymentType, string> = {
  [JobEmploymentType.FULL_TIME]: "Full Time",
  [JobEmploymentType.PART_TIME]: "Part Time",
  [JobEmploymentType.CONTRACT]: "Contract",
  [JobEmploymentType.TEMPORARY]: "Temporary",
  [JobEmploymentType.VOLUNTEER]: "Volunteer"
};

export const employmentTypeOptions = Object.entries(employmentTypeLabels).map(([value, label]) => ({
  value: value as JobEmploymentType,
  label
}));

export const MAX_JOB_IMAGE_BYTES = 10 * 1024 * 1024;

export const createJobImageUploadIntentSchema = z.object({
  fileName: z.string().min(1).max(240),
  mimeType: z.string().regex(/^image\/(jpeg|png|webp)$/),
  sizeBytes: z.number().int().positive().max(MAX_JOB_IMAGE_BYTES)
});

export const completeJobImageUploadSchema = createJobImageUploadIntentSchema.extend({
  intentId: z.string().trim().min(1).max(80),
  storageKey: z.string().min(1).max(600)
});

export const createJobListingSchema = z.object({
  title: z.string().min(2, "Name the job.").max(140),
  companyName: z.string().max(140).optional().or(z.literal("")),
  summary: z.string().max(220).optional().or(z.literal("")),
  description: z.string().min(10, "Describe the job.").max(4000),
  needs: z.string().max(2000).optional().or(z.literal("")),
  wants: z.string().max(2000).optional().or(z.literal("")),
  category: z.nativeEnum(JobCategory),
  employmentType: z.nativeEnum(JobEmploymentType),
  location: z.string().max(180).optional().or(z.literal("")),
  remote: z.boolean().default(false),
  compensation: z.string().max(140).optional().or(z.literal("")),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().max(60).optional().or(z.literal("")),
  contactInstructions: z.string().max(1000).optional().or(z.literal("")),
  imageMediaAssetId: z.string().max(80).optional().nullable().or(z.literal("")),
  imageOverlayText: z.string().max(140).optional().or(z.literal(""))
});

export const updateJobListingSchema = createJobListingSchema;

export type JobListingCardView = {
  id: string;
  slug: string;
  title: string;
  companyName?: string | null;
  summary?: string | null;
  category: JobCategory;
  categoryLabel: string;
  employmentType: JobEmploymentType;
  employmentTypeLabel: string;
  location?: string | null;
  remote: boolean;
  compensation?: string | null;
  imageMediaAssetId?: string | null;
  imageUrl?: string | null;
  imageOverlayText?: string | null;
  status: JobListingStatus;
  createdAt: string;
  employer: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string | null;
  };
};

export type JobListingDetailView = JobListingCardView & {
  description: string;
  needs?: string | null;
  wants?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactInstructions?: string | null;
  imageOriginalName?: string | null;
  viewerCanManage: boolean;
  viewerCanPromote: boolean;
};
