import { AuditorDirectoryKind, ScientologyClassification } from "@prisma/client";
import { z } from "zod";

export const updateAuditorProfileSchema = z.object({
  practiceName: z.string().min(2, "Name your practice.").max(140),
  directoryKind: z.nativeEnum(AuditorDirectoryKind).default(AuditorDirectoryKind.FIELD_AUDITOR),
  location: z.string().max(180).optional().or(z.literal("")),
  address: z.string().max(400).optional().or(z.literal("")),
  willingToTravel: z.boolean().default(false),
  bio: z.string().max(2000).optional().or(z.literal("")),
  offerings: z.string().max(2000).optional().or(z.literal("")),
  contactEmail: z.string().email("Enter a valid public email.").max(254).optional().or(z.literal("")),
  phone: z.string().max(60).optional().or(z.literal("")),
  website: z.string().max(200).optional().or(z.literal("")),
  active: z.boolean().default(true)
});

export type AuditorScientologySummary = {
  classification: ScientologyClassification;
  orgName?: string | null;
  trainingLevel?: string | null;
  processingStatus?: string | null;
  educationNotes?: string | null;
};

export type AuditorProfileView = {
  id: string;
  username: string;
  directoryKind: AuditorDirectoryKind;
  isOfficial: boolean;
  displayName: string;
  avatarUrl?: string | null;
  practiceName: string;
  location?: string | null;
  address?: string | null;
  willingToTravel: boolean;
  bio?: string | null;
  offerings?: string | null;
  contactEmail?: string | null;
  phone?: string | null;
  website?: string | null;
  sourceUrl?: string | null;
  active: boolean;
  createdAt: string;
  scientology: AuditorScientologySummary;
};

export type MyAuditorProfileView = {
  canCreate: boolean;
  reason?: string;
  profile?: AuditorProfileView | null;
  scientology: AuditorScientologySummary;
};
