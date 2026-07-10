import { ScientologyClassification, ScientologyVisibility } from "@prisma/client";
import { z } from "zod";

export const scientologyTrainingLevels = [
  "",
  "Not Classified",
  "Student Hat",
  "Pro Upper Indoc",
  "Pro Metering",
  "Class 0 Auditor",
  "Class I Auditor",
  "Class II Auditor",
  "Class III Auditor",
  "Class IV",
  "Class IV Auditor",
  "Class V",
  "Class V Auditor",
  "Class V Graduate",
  "Class V Graduate Auditor",
  "Class VA Graduate",
  "Class VA Graduate Auditor",
  "Class VI",
  "Class VI Auditor",
  "Class VII Auditor",
  "Class VIII Auditor"
] as const;

export const scientologyProcessingStatuses = [
  "",
  "Purification Rundown",
  "TRs and Objectives",
  "Scientology Drug Rundown",
  "Happiness Rundown",
  "ARC Straightwire Expanded",
  "Grade 0 Expanded",
  "Grade I Expanded",
  "Grade II Expanded",
  "Grade III Expanded",
  "Grade IV Expanded",
  "New Era Dianetics",
  "Expanded Dianetics",
  "Grade V",
  "Grade VA",
  "OT Preps",
  "Grade VI Release",
  "Clearing Course",
  "Clear Certainty Rundown",
  "CLEAR",
  "Sunshine Rundown",
  "Solo Course Part I",
  "OT Preparations",
  "Solo Course Part II",
  "OT Eligibility",
  "OT I",
  "OT II",
  "OT III",
  "OT IV",
  "OT V",
  "OT VI",
  "OT VII",
  "OT VIII"
] as const;

export const scientologyIntroServices = [
  "Success Through Communication Route",
  "Life Improvement Course Route",
  "Personal Efficiency Route",
  "Scientology Introductory Auditing Route",
  "Dianetics (Book One) Route",
  "Anatomy of the Human Mind Route",
  "Purification Route",
  "The Way to Happiness Route",
  "Hubbard Key to Life Course Route",
  "Beginning Books and Extension Courses, Lectures and Public Films"
] as const;

export const scientologyCourseCompletions = [
  "PTS/SP",
  "Ethics Specialist",
  "Basic Books",
  "Full Basics",
  "Books and Lectures"
] as const;

export const scientologyOtherTechnicalCourses = [
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
  "Children's Communication Course",
  "Hubbard Basic Art Course"
] as const;

export const scientologyTechnicalSpecialistCourses = [
  "Vital Information Rundown Auditor Course",
  "Psych Treatment Repair Auditor Course",
  "Allergy or Asthma Rundown Auditor Course",
  "Student Booster Rundown Auditor Course",
  "Est Repair Auditor Course",
  "South African Rundown Auditor Course",
  "Introspection Rundown Auditor Course",
  "Handling Fear of People Auditor Course",
  "PTS/SP Auditor Course",
  "Scientology Marriage Counselling Auditor Course",
  "Hubbard False Purpose Rundown Auditor Course",
  "Hubbard Senior Confessional Auditor Course",
  "Hubbard Happiness Rundown Auditor Course",
  "Scientology Drug Rundown Auditor Course",
  "PDH Detection and Handling Auditor Course",
  "The Hubbard Professional Word Clearer Course"
] as const;

export const scientologyAdditionalProcessingServices = [
  "L12, Flag OT Executive Rundown",
  "L11, New Life Rundown",
  "L10 Rundown",
  "Super Power",
  "Cause Resurgence Rundown",
  "Flag Only Rundowns",
  "Special Rundowns and Actions",
  "False Purpose Rundown",
  "Confessionals",
  "Happiness Rundown",
  "PTS Rundown",
  "Method One Word Clearing",
  "Therapeutic TR Course"
] as const;

const stringArray = z.array(z.string().min(1).max(160)).max(80).default([]);

export const updateScientologyProfileSchema = z.object({
  classification: z.nativeEnum(ScientologyClassification).default(ScientologyClassification.PUBLIC),
  orgName: z.string().max(160).optional().or(z.literal("")),
  lastServiceName: z.string().max(160).optional().or(z.literal("")),
  lastServiceAt: z.string().optional().or(z.literal("")),
  iasMembershipLast6: z.string().regex(/^\d{6}$/, "IAS membership last 6 must be exactly 6 digits.").optional().or(z.literal("")),
  trainingLevel: z.enum(scientologyTrainingLevels).optional().default(""),
  processingStatus: z.enum(scientologyProcessingStatuses).optional().default(""),
  courseCompletions: stringArray,
  introServices: stringArray,
  technicalCourses: stringArray,
  specialistCourses: stringArray,
  additionalProcessing: stringArray,
  goodStandingAttested: z.boolean().default(false),
  educationNotes: z.string().max(4000).optional().or(z.literal("")),
  visibility: z.nativeEnum(ScientologyVisibility).default(ScientologyVisibility.PRIVATE)
});

export const createScientologyCommendationUploadIntentSchema = z.object({
  fileName: z.string().min(1).max(240),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  sizeBytes: z.number().int().positive().max(15 * 1024 * 1024)
});

export const completeScientologyCommendationUploadSchema = createScientologyCommendationUploadIntentSchema.extend({
  intentId: z.string().trim().min(1).max(80),
  storageKey: z.string().min(1).max(600),
  title: z.string().max(160).optional().or(z.literal("")),
  isFlattenedPdf: z.boolean().default(false)
});

export type ScientologyPublicSummary = {
  classification: ScientologyClassification;
  trainingLevel?: string | null;
  processingStatus?: string | null;
  visible: boolean;
};

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function parseScientologySelections(profile: {
  courseCompletions?: unknown;
  introServices?: unknown;
  technicalCourses?: unknown;
  specialistCourses?: unknown;
  additionalProcessing?: unknown;
} | null) {
  return {
    courseCompletions: asStringArray(profile?.courseCompletions),
    introServices: asStringArray(profile?.introServices),
    technicalCourses: asStringArray(profile?.technicalCourses),
    specialistCourses: asStringArray(profile?.specialistCourses),
    additionalProcessing: asStringArray(profile?.additionalProcessing)
  };
}
