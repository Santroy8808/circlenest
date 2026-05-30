export const SCIENTOLOGY_TRAINING_LEVELS = [
  "Success Through Communication",
  "Hubbard Method One(tm) Co-Audit Course",
  "Hubard Graduate of StudyTech",
  "New Hubbard Professional TR Course",
  "Hubbard Professional Upper Indoc TR Course",
  "Hubbard Professional Metering Course",
  "Hubbard Recognized Scientologist (HRS, Provisional)",
  "Hubbard Trained Scientologist (HTS, Provisional)",
  "Hubbard Certified AUditor (HCA, Provisional)",
  "Hubbard Professional Auditor (HPA, Provisional)",
  "Hubbard Advanced Auditor (HAA, Provisional)",
  "Class IV Auditor Interned",
  "Class V Auditor",
  "Class V Auditor Interned",
  "Graduate V Auditor",
  "Graduate V Auditor Interned",
  "Class VI Senior Scientologist",
  "Class VII Hubbard Specialist of Standard Tech",
] as const;

export const SCIENTOLOGY_PROCESSING_LEVELS = [
  "Purification Rundown",
  "Survival Rundown",
  "Scientology Drug Rundown",
  "Happiness Rundown",
  "ARC Straightwire (tm)",
  "Grade 0",
  "Grade I",
  "Grade 2",
  "Grade 3",
  "Grade 4",
  "New Era Dianetics Drug Rundown",
  "New Era Dianetics Completion",
  "Expanded Dianetics Completion",
  "CLEAR",
  "Preps",
  "OT 1",
  "OT 2",
  "OT 3",
  "OT 4",
  "OT 5",
  "OT 6",
  "OT 7",
  "OT 8",
  "L11",
  "L10",
  "L12",
  "Super Power",
] as const;

export const SCIENTOLOGY_ADDITIONAL_COURSES = [
  "KTL",
  "LOC",
  "Primary RD",
  "Scientology Minister Course",
  "Case Supervisor Class IV",
  "Case Supervisor Class V",
  "Case Supervsior Class VI",
  "Keeping Scientology Working Course",
  "Professional Product Debug Course",
  "PTS/SP Course",
  "Introduction to Scientology Ethics Course",
  "Scientology Ethics Specialist Course",
  "Hubbard Assists Processing Auditor Course",
  "Hubbard Group Auditor Course",
  "Hubbard Introductory & Demonstration Auditor Course",
  "Basic Study Manual",
  "Special Course in Human Evaluation",
  "Hubbard Basic Art Course",
] as const;

const trainingSet = new Set<string>(SCIENTOLOGY_TRAINING_LEVELS);
const processingSet = new Set<string>(SCIENTOLOGY_PROCESSING_LEVELS);
const additionalSet = new Set<string>(SCIENTOLOGY_ADDITIONAL_COURSES);

export function normalizeScientologyPrimary(value: unknown, allowed: Set<string>): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return allowed.has(trimmed) ? trimmed : null;
}

export function normalizeScientologyChecklist(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => additionalSet.has(entry)),
    ),
  );
}

export function parseScientologyChecklist(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    return normalizeScientologyChecklist(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function normalizeScientologyTraining(value: unknown): string | null {
  return normalizeScientologyPrimary(value, trainingSet);
}

export function normalizeScientologyProcessing(value: unknown): string | null {
  return normalizeScientologyPrimary(value, processingSet);
}
