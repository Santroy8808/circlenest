import { compare, hash } from "bcryptjs";

const PASSWORD_MIN_LENGTH = 10;

export type PasswordPolicyResult = {
  valid: boolean;
  issues: string[];
};

export function validatePasswordStrength(password: string): PasswordPolicyResult {
  const issues: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    issues.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  }

  if (!/[a-z]/.test(password)) {
    issues.push("Add at least one lowercase letter.");
  }

  if (!/[A-Z]/.test(password)) {
    issues.push("Add at least one uppercase letter.");
  }

  if (!/\d/.test(password)) {
    issues.push("Add at least one number.");
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    issues.push("Add at least one symbol.");
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

export function hashPassword(password: string) {
  return hash(password, 12);
}

export function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}
