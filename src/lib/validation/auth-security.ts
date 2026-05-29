import { z } from "zod";
import { validateStrongPassword } from "@/lib/security/password-policy";

export const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(14).max(72),
}).superRefine((data, ctx) => {
  const error = validateStrongPassword(data.password);
  if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error, path: ["password"] });
});

export const twoFaTokenSchema = z.object({
  token: z.string().min(6).max(8),
});
