export const INTERNAL_TEST_EMAIL_DOMAIN = "theta-space.dev";

export function isInternalTestEmail(email: string) {
  return email.trim().toLowerCase().endsWith(`@${INTERNAL_TEST_EMAIL_DOMAIN}`);
}
