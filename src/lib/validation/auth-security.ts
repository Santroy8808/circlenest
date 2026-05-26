import { z } from "zod";

export const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8).max(72),
});

export const twoFaTokenSchema = z.object({
  token: z.string().min(6).max(8),
});
