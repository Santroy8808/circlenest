import { FundraiserCategory } from "@prisma/client";
import { z } from "zod";

export const fundraiserCategoryLabels: Record<FundraiserCategory, string> = {
  COMMUNITY_PROJECT: "Community project",
  EVENT_SUPPORT: "Event support",
  MATERIALS_SUPPLIES: "Materials and supplies",
  EMERGENCY_SUPPORT: "Emergency support",
  OTHER: "Other"
};

export const fundraiserCategoryOptions = Object.entries(fundraiserCategoryLabels).map(([value, label]) => ({
  value: value as FundraiserCategory,
  label
}));

export const createFundraiserSchema = z.object({
  title: z.string().trim().min(2).max(120),
  summary: z.string().trim().max(180).optional(),
  description: z.string().trim().min(10).max(3000),
  category: z.nativeEnum(FundraiserCategory).default(FundraiserCategory.COMMUNITY_PROJECT),
  goalAmountCents: z.coerce.number().int().min(100).max(100000000).optional().nullable(),
  endsAt: z.string().trim().optional()
});

export const createContributionIntentSchema = z.object({
  amountCents: z.coerce.number().int().min(100).max(100000000),
  note: z.string().trim().max(500).optional()
});

export type FundraiserCreateState = {
  viewerCanCreate: boolean;
  reason?: string;
  fundraiserLimit: number | null;
  fundraisersRemaining: number | null;
};

export type FundraiserCardView = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  category: FundraiserCategory;
  categoryLabel: string;
  goalAmountCents: number | null;
  pledgedAmountCents: number;
  currency: string;
  status: "ACTIVE" | "PAUSED" | "ENDED" | "ARCHIVED";
  createdAt: string;
  creator: {
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
};

export type FundraiserDetailView = FundraiserCardView & {
  description: string;
  endsAt: string | null;
  viewerCanManage: boolean;
  contributionCount: number;
};
