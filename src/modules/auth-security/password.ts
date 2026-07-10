import { compare, hash } from "bcryptjs";
import { MAX_NEW_PASSWORD_BYTES, MIN_NEW_PASSWORD_LENGTH } from "@/modules/auth-security/types";

const BCRYPT_COST = 12;

export type PasswordPolicyResult = {
  valid: boolean;
  issues: string[];
};

export function validatePasswordStrength(password: string): PasswordPolicyResult {
  const issues: string[] = [];

  if (password.length < MIN_NEW_PASSWORD_LENGTH) {
    issues.push(`Use at least ${MIN_NEW_PASSWORD_LENGTH} characters.`);
  }

  if (new TextEncoder().encode(password).byteLength > MAX_NEW_PASSWORD_BYTES) {
    issues.push(`Use ${MAX_NEW_PASSWORD_BYTES} UTF-8 bytes or fewer.`);
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

export function hashPassword(password: string) {
  const policy = validatePasswordStrength(password);

  if (!policy.valid) {
    throw new Error("Password does not satisfy the shared password contract.");
  }

  return hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, passwordHash: string) {
  try {
    return await compare(password, passwordHash);
  } catch {
    return false;
  }
}
