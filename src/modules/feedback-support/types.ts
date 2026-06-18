import { FeedbackTicketSeverity } from "@prisma/client";
import { z } from "zod";

export const createFeedbackTicketSchema = z.object({
  title: z.string().min(3, "Add a short title.").max(120),
  description: z.string().min(10, "Describe what happened.").max(4000),
  reporterEmail: z.string().email().optional().or(z.literal("")),
  pageUrl: z.string().max(600).optional(),
  severity: z.nativeEnum(FeedbackTicketSeverity).default(FeedbackTicketSeverity.normal),
  diagnostics: z.record(z.unknown()).optional()
});
