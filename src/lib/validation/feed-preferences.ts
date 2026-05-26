import { z } from "zod";

export const feedPreferenceSchema = z.object({
  mode: z.enum(["CHRONOLOGICAL", "FRIENDS_FIRST", "INTEREST_BASED", "QUIET", "DISCOVERY"]),
});

export const muteUserSchema = z.object({
  mutedUserId: z.string().cuid(),
});

export const muteTopicSchema = z.object({
  topic: z.string().min(1).max(64),
});
