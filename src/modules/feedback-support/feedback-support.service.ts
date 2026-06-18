import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { createFeedbackTicketSchema } from "@/modules/feedback-support/types";

const MODULE_KEY = "feedback-support";

function createPublicTicketId() {
  return `TS-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function createFeedbackTicket(input: unknown, context: { userId?: string; userAgent?: string } = {}) {
  const parsed = createFeedbackTicketSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid ticket." };
  }

  try {
    const ticket = await prisma.feedbackTicket.create({
      data: {
        publicId: createPublicTicketId(),
        reporterUserId: context.userId,
        reporterEmail: parsed.data.reporterEmail || undefined,
        pageUrl: parsed.data.pageUrl,
        title: parsed.data.title,
        description: parsed.data.description,
        severity: parsed.data.severity,
        userAgent: context.userAgent,
        diagnostics: parsed.data.diagnostics as Prisma.InputJsonObject | undefined,
        events: {
          create: {
            actorId: context.userId,
            action: "ticket.created",
            metadata: {
              source: "global-feedback"
            }
          }
        }
      }
    });

    await diagnostics.info(MODULE_KEY, "Feedback ticket created.", {
      ticketId: ticket.publicId,
      reporterUserId: context.userId,
      pageUrl: ticket.pageUrl
    });

    return { ok: true as const, ticket };
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Feedback ticket creation failed.", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return { ok: false as const, error: "Could not create ticket." };
  }
}
