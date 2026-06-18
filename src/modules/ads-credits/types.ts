import { AdPlacement, ScientologyClassification } from "@prisma/client";
import { z } from "zod";

export const adPlacementLabels: Record<AdPlacement, string> = {
  RIGHT_STREAM: "Right ad stream",
  BUSINESS_SPOTLIGHT: "Business spotlight",
  RESERVED_STREAM: "Reserved stream slot"
};

export const adPlacementOptions = Object.entries(adPlacementLabels).map(([value, label]) => ({
  value: value as AdPlacement,
  label
}));

export const adClassificationLabels: Record<ScientologyClassification, string> = {
  PUBLIC: "Public",
  PRECLEAR: "Preclear",
  CLEAR: "Clear",
  OT: "OT",
  AUDITOR: "Auditor",
  STAFF: "Staff",
  SEA_ORG: "Sea Org",
  OTHER: "Other"
};

export const adClassificationOptions = Object.entries(adClassificationLabels).map(([value, label]) => ({
  value: value as ScientologyClassification,
  label
}));

export const createAdCampaignSchema = z.object({
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(8).max(280),
  destinationUrl: z.string().trim().url().max(240).optional().or(z.literal("")),
  placement: z.nativeEnum(AdPlacement).default(AdPlacement.RIGHT_STREAM),
  targetLocation: z.string().trim().max(120).optional(),
  targetClassification: z.nativeEnum(ScientologyClassification).optional().nullable(),
  totalBudgetCredits: z.coerce.number().int().min(1).max(100000),
  dailyBudgetCredits: z.coerce.number().int().min(0).max(100000).optional().nullable()
});

export type AdCampaignCardView = {
  id: string;
  title: string;
  body: string;
  destinationUrl: string | null;
  placement: AdPlacement;
  placementLabel: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ENDED" | "ARCHIVED";
  targetLocation: string | null;
  targetClassification: ScientologyClassification | null;
  totalBudgetCredits: number;
  dailyBudgetCredits: number | null;
  spentCredits: number;
  createdAt: string;
};

export type AdsManagerView = {
  canCreate: boolean;
  reason?: string;
  platformCredits: number;
  campaigns: AdCampaignCardView[];
};
