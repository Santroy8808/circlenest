import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().email(),
  backupEmail: z.string().email().optional(),
  username: z.string().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(72),
});

export const postSchema = z.object({
  content: z.string().min(1).max(5000),
  imageUrl: z.string().url().optional(),
  topic: z.string().max(64).optional(),
});
