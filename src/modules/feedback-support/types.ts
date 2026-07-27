import {
  FeedbackTicketKind,
  FeedbackTicketMessageType,
  FeedbackTicketSeverity,
  FeedbackTicketStatus
} from "@prisma/client";
import { z } from "zod";
import {
  FEEDBACK_CONTEXT_MAX_BYTES,
  FEEDBACK_SCREENSHOT_MAX_BYTES,
  FEEDBACK_SCREENSHOT_MIME_TYPES
} from "@/modules/feedback-support/config";

const boundedContextSchema = z
  .record(z.unknown())
  .refine(
    (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength <= FEEDBACK_CONTEXT_MAX_BYTES,
    "Page context is too large."
  );

export const createFeedbackTicketSchema = z.object({
  title: z.string().trim().min(3, "Add a short subject.").max(120),
  description: z.string().trim().min(10, "Describe what happened.").max(4000),
  kind: z.nativeEnum(FeedbackTicketKind).default(FeedbackTicketKind.BUG),
  reporterEmail: z.string().trim().email().max(254).optional().or(z.literal("")),
  pageUrl: z.string().trim().max(2048).optional(),
  sourceRoute: z.string().trim().max(600).optional(),
  sourceEntityType: z.string().trim().max(80).optional(),
  sourceEntityId: z.string().trim().max(160).optional(),
  pageContext: boundedContextSchema.optional(),
  clientContext: boundedContextSchema.optional(),
  screenshotUploadIntentId: z.string().trim().min(1).max(120).optional(),
  submissionKey: z.string().uuid().optional(),
  severity: z.nativeEnum(FeedbackTicketSeverity).default(FeedbackTicketSeverity.normal),
  diagnostics: boundedContextSchema.optional()
});

export const feedbackScreenshotIntentSchema = z.object({
  fileName: z.string().trim().min(1).max(120),
  mimeType: z.enum(FEEDBACK_SCREENSHOT_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(FEEDBACK_SCREENSHOT_MAX_BYTES),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i).optional()
});

export const feedbackTicketListQuerySchema = z.object({
  search: z.string().trim().max(160).optional(),
  kind: z.nativeEnum(FeedbackTicketKind).optional(),
  status: z.enum(["OPEN", "RESOLVED", "ALL"]).default("OPEN"),
  assignment: z.enum(["ALL", "UNASSIGNED", "ME", "OTHER"]).default("ALL"),
  sort: z.enum(["createdAt", "updatedAt", "status", "assignedTo", "kind", "openDuration"]).default("updatedAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50)
});

export const feedbackTicketBulkActionSchema = z
  .object({
    ticketIds: z.array(z.string().trim().min(1).max(120)).min(1).max(100),
    action: z.enum(["ASSIGN_TO_ME", "ASSIGN", "RESOLVE", "REOPEN", "CHANGE_KIND"]),
    assigneeUserId: z.string().trim().min(1).max(120).nullable().optional(),
    kind: z.nativeEnum(FeedbackTicketKind).optional(),
    resolution: z.string().trim().max(2000).optional(),
    expectedVersions: z.record(z.number().int().positive())
  })
  .superRefine((value, context) => {
    if (value.action === "ASSIGN" && !value.assigneeUserId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assigneeUserId"],
        message: "Choose an administrator."
      });
    }
    if (value.action === "CHANGE_KIND" && !value.kind) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["kind"],
        message: "Choose a feedback type."
      });
    }
  });

export const createFeedbackTicketMessageSchema = z.object({
  type: z.nativeEnum(FeedbackTicketMessageType).default(FeedbackTicketMessageType.NORMAL),
  body: z.string().trim().min(1, "Write a message.").max(8000),
  idempotencyKey: z.string().uuid()
});

export const updateFeedbackTicketSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    assignedToUserId: z.string().trim().min(1).max(120).nullable().optional(),
    kind: z.nativeEnum(FeedbackTicketKind).optional(),
    status: z.enum([FeedbackTicketStatus.OPEN, FeedbackTicketStatus.RESOLVED]).optional(),
    resolution: z.string().trim().max(2000).optional(),
    finalMessage: z.string().trim().min(1).max(8000).optional(),
    messageIdempotencyKey: z.string().uuid().optional()
  })
  .refine(
    (value) =>
      value.assignedToUserId !== undefined ||
      value.kind !== undefined ||
      value.status !== undefined,
    "Choose a ticket change."
  );

export const feedbackTicketReadSchema = z.object({
  includeInternal: z.boolean().default(false)
});

export type CreateFeedbackTicketInput = z.infer<typeof createFeedbackTicketSchema>;
export type FeedbackTicketListQuery = z.infer<typeof feedbackTicketListQuerySchema>;
export type FeedbackTicketBulkActionInput = z.infer<typeof feedbackTicketBulkActionSchema>;
export type CreateFeedbackTicketMessageInput = z.infer<typeof createFeedbackTicketMessageSchema>;
export type UpdateFeedbackTicketInput = z.infer<typeof updateFeedbackTicketSchema>;
