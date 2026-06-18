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

export const jobCategoryOptions = Object.entries(jobCategoryLabels).map(([value, label]) => ({
  value: value as JobCategory,
  label
}));

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

export const createJobListingSchema = z.object({
  title: z.string().min(2, "Name the job.").max(140),
  companyName: z.string().max(140).optional().or(z.literal("")),
  summary: z.string().max(220).optional().or(z.literal("")),
  description: z.string().min(10, "Describe the job.").max(4000),
  category: z.nativeEnum(JobCategory),
  employmentType: z.nativeEnum(JobEmploymentType),
  location: z.string().max(180).optional().or(z.literal("")),
  remote: z.boolean().default(false),
  compensation: z.string().max(140).optional().or(z.literal("")),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactInstructions: z.string().max(1000).optional().or(z.literal(""))
});

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
  contactEmail?: string | null;
  contactInstructions?: string | null;
  viewerCanManage: boolean;
  viewerCanPromote: boolean;
};
