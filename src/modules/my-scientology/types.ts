import { ScientologyClassification, ScientologyVisibility } from "@prisma/client";
import { z } from "zod";

export const updateScientologyProfileSchema = z.object({
  classification: z.nativeEnum(ScientologyClassification).default(ScientologyClassification.PUBLIC),
  orgName: z.string().max(160).optional().or(z.literal("")),
  lastServiceName: z.string().max(160).optional().or(z.literal("")),
  lastServiceAt: z.string().optional().or(z.literal("")),
  trainingLevel: z.string().max(160).optional().or(z.literal("")),
  processingStatus: z.string().max(160).optional().or(z.literal("")),
  goodStandingAttested: z.boolean().default(false),
  educationNotes: z.string().max(4000).optional().or(z.literal("")),
  visibility: z.nativeEnum(ScientologyVisibility).default(ScientologyVisibility.PRIVATE),
  adTargetingAllowed: z.boolean().default(false)
});

export type ScientologyPublicSummary = {
  classification: ScientologyClassification;
  trainingLevel?: string | null;
  processingStatus?: string | null;
  visible: boolean;
};
