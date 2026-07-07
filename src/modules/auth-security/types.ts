import { AccountPurpose, MembershipTier, UserRole } from "@prisma/client";
import { z } from "zod";

export const loginSchema = z
  .object({
    identifier: z.string().optional(),
    email: z.string().optional(),
    username: z.string().optional(),
    handle: z.string().optional(),
    password: z.string().min(1, "Enter your password.")
  })
  .transform((input) => ({
    identifier: input.identifier ?? input.email ?? input.username ?? input.handle ?? "",
    password: input.password
  }))
  .pipe(
    z.object({
      identifier: z.string().trim().min(1, "Enter an email or username."),
      password: z.string().min(1, "Enter your password.")
    })
  );

export const signupSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  username: z
    .string()
    .min(3, "Use at least 3 characters.")
    .max(32, "Use 32 characters or fewer.")
    .regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers, and underscores only."),
  displayName: z.string().min(1, "Enter a display name.").max(80),
  password: z.string().min(1),
  inviteCode: z.string().optional()
});

export const passwordResetRequestSchema = z.object({
  identifier: z.string().min(1, "Enter an email or username.")
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(20, "Enter a valid reset token."),
  password: z.string().min(1)
});

export const emailVerificationConfirmSchema = z.object({
  token: z.string().min(20, "Enter a valid verification token.")
});

export type AuthenticatedUser = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: UserRole;
  accountPurpose: AccountPurpose;
  tier: MembershipTier;
  sessionVersion: number;
};

export type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};
