export const PREVERIFIED_EMAIL_DOMAINS = ["theta-space.dev", "theta-space.net"] as const;

export function isInternalTestEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return PREVERIFIED_EMAIL_DOMAINS.some((domain) => normalized.endsWith(`@${domain}`));
}
