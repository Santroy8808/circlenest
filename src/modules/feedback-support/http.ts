export const FEEDBACK_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie"
} as const;

export function feedbackErrorStatus(code?: string) {
  if (code === "UNAUTHENTICATED") return 401;
  if (code === "FORBIDDEN") return 403;
  if (code === "NOT_FOUND") return 404;
  if (code === "CONFLICT" || code === "ALREADY_USED") return 409;
  if (code === "RATE_LIMITED") return 429;
  if (code === "FAILED" || code === "STORAGE_UNAVAILABLE") return 500;
  return 422;
}
