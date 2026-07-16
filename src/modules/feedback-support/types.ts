import { FeedbackTicketKind, FeedbackTicketSeverity } from "@prisma/client";
import { z } from "zod";

export const createFeedbackTicketSchema = z.object({
  title: z.string().trim().min(3, "Add a short title.").max(120),
  description: z.string().trim().min(10, "Describe what happened.").max(4000),
  kind: z.nativeEnum(FeedbackTicketKind).default(FeedbackTicketKind.ISSUE_REPORT),
  reporterEmail: z.string().trim().email().max(254).optional().or(z.literal("")),
  pageUrl: z.string().trim().max(600).optional(),
  severity: z.nativeEnum(FeedbackTicketSeverity).default(FeedbackTicketSeverity.normal),
  diagnostics: z
    .record(z.union([z.string().trim().max(500), z.number().finite(), z.boolean(), z.null()]))
    .refine((value) => Object.keys(value).length <= 25, "Include 25 diagnostic fields or fewer.")
    .optional()
});
