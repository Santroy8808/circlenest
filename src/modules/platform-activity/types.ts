import { PlatformActivityEventType } from "@prisma/client";
import { z } from "zod";

const safeMetadataValue = z.union([z.string().max(240), z.number(), z.boolean(), z.null()]);

export const recordPlatformActivitySchema = z.object({
  eventType: z.nativeEnum(PlatformActivityEventType),
  route: z.string().trim().max(240).optional(),
  module: z.string().trim().max(80).optional(),
  action: z.string().trim().max(80).optional(),
  targetType: z.string().trim().max(80).optional(),
  targetId: z.string().trim().max(120).optional(),
  sessionKey: z.string().trim().max(120).optional(),
  metadata: z.record(safeMetadataValue).optional()
});

export type PlatformActivitySummary = {
  activeUsers15m: number;
  pageViews24h: number;
  actions24h: number;
  topRoutes24h: Array<{ route: string; count: number }>;
};
