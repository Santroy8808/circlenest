export const FEEDBACK_TYPE_OPTIONS = [
  { value: "BUG", label: "Bug" },
  { value: "FEATURE_REQUEST", label: "Feature Request" },
  { value: "USABILITY", label: "Usability" },
  { value: "CONTENT", label: "Content" },
  { value: "ACCOUNT_ACCESS", label: "Account or Access" },
  { value: "SAFETY_MODERATION", label: "Safety or Moderation" },
  { value: "BILLING", label: "Billing" },
  { value: "OTHER", label: "Other" }
] as const;

export const FEEDBACK_SCREENSHOT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const FEEDBACK_SCREENSHOT_MAX_BYTES = 2 * 1024 * 1024;
export const FEEDBACK_CONTEXT_MAX_BYTES = 32 * 1024;

export type ConfiguredFeedbackKind = (typeof FEEDBACK_TYPE_OPTIONS)[number]["value"];

const FEEDBACK_TYPE_LABELS: Record<string, string> = {
  ...Object.fromEntries(FEEDBACK_TYPE_OPTIONS.map((option) => [option.value, option.label])),
  ISSUE_REPORT: "Bug",
  SUPPORT_REQUEST: "Other"
};

export function feedbackTypeLabel(value: string) {
  return FEEDBACK_TYPE_LABELS[value] ?? "Other";
}
