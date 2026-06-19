import { ScientologyClassification, ScientologyVisibility } from "@prisma/client";
import { z } from "zod";

export const scientologyTrainingLevels = [
  "",
  "Student Hat",
  "Hubbard Qualified Scientologist",
  "Academy Level 0",
  "Academy Level I",
  "Academy Level II",
  "Academy Level III",
  "Academy Level IV",
  "Class V Auditor",
  "New Era Dianetics Auditor",
  "Class VI Auditor",
  "Class VII Auditor",
  "Class VIII Auditor"
] as const;

export const scientologyProcessingStatuses = [
  "",
  "Public",
  "Preclear",
  "Grade 0",
  "Grade I",
  "Grade II",
  "Grade III",
  "Grade IV",
  "New Era Dianetics",
  "Clear",
  "OT I",
  "OT II",
  "OT III",
  "OT IV",
  "OT V",
  "OT VI",
  "OT VII",
  "OT VIII"
] as const;

export const updateScientologyProfileSchema = z.object({
  classification: z.nativeEnum(ScientologyClassification).default(ScientologyClassification.PUBLIC),
  orgName: z.string().max(160).optional().or(z.literal("")),
  lastServiceName: z.string().max(160).optional().or(z.literal("")),
  lastServiceAt: z.string().optional().or(z.literal("")),
  trainingLevel: z.enum(scientologyTrainingLevels).optional().default(""),
  processingStatus: z.enum(scientologyProcessingStatuses).optional().default(""),
  goodStandingAttested: z.boolean().default(false),
  educationNotes: z.string().max(4000).optional().or(z.literal("")),
  visibility: z.nativeEnum(ScientologyVisibility).default(ScientologyVisibility.PRIVATE)
});

export type ScientologyPublicSummary = {
  classification: ScientologyClassification;
  trainingLevel?: string | null;
  processingStatus?: string | null;
  visible: boolean;
};
