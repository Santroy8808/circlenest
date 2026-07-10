import { AccountPurpose, MembershipTier, UserRole } from "@prisma/client";
import { z } from "zod";

const MAX_IDENTIFIER_LENGTH = 254;
export const MIN_NEW_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;
export const MAX_NEW_PASSWORD_BYTES = 72;

const loginPasswordSchema = z
  .string()
  .min(1, "Enter your password.")
  .max(MAX_PASSWORD_LENGTH, `Use ${MAX_PASSWORD_LENGTH} characters or fewer.`);

export const newPasswordSchema = z
  .string()
  .min(MIN_NEW_PASSWORD_LENGTH, `Use at least ${MIN_NEW_PASSWORD_LENGTH} characters.`)
  .max(MAX_NEW_PASSWORD_BYTES, `Use ${MAX_NEW_PASSWORD_BYTES} characters or fewer.`)
  .refine(
    (value) => new TextEncoder().encode(value).byteLength <= MAX_NEW_PASSWORD_BYTES,
    `Use ${MAX_NEW_PASSWORD_BYTES} UTF-8 bytes or fewer.`
  );

export const loginSchema = z
  .object({
    identifier: z.string().optional(),
    email: z.string().optional(),
    username: z.string().optional(),
    handle: z.string().optional(),
    password: loginPasswordSchema
  })
  .transform((input) => ({
    identifier: input.identifier ?? input.email ?? input.username ?? input.handle ?? "",
    password: input.password
  }))
  .pipe(
    z.object({
      identifier: z.string().trim().min(1, "Enter an email or username.").max(MAX_IDENTIFIER_LENGTH),
      password: loginPasswordSchema
    })
  );

export const signupSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(MAX_IDENTIFIER_LENGTH),
  username: z
    .string()
    .trim()
    .min(3, "Use at least 3 characters.")
    .max(32, "Use 32 characters or fewer.")
    .regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers, and underscores only."),
  displayName: z.string().trim().min(1, "Enter a display name.").max(80),
  password: newPasswordSchema,
  inviteCode: z.string().trim().max(128).optional()
});

export const passwordResetRequestSchema = z.object({
  identifier: z.string().trim().min(1, "Enter an email or username.").max(MAX_IDENTIFIER_LENGTH)
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().trim().min(20, "Enter a valid reset token.").max(256),
  password: newPasswordSchema
});

export const emailVerificationConfirmSchema = z.object({
  token: z.string().trim().min(20, "Enter a valid verification token.").max(256)
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
