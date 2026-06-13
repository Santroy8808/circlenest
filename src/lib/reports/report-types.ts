export const REPORT_TARGET_TYPES = [
  "POST",
  "COMMENT",
  "PHOTO",
  "PHOTO_COMMENT",
  "GROUP",
  "EVENT",
  "MARKET_LISTING",
  "BAZAAR_LISTING",
  "JOB_LISTING",
  "FUNDRAISER",
  "AUDITOR_LISTING",
  "USER",
] as const;

export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_REASONS = [
  "SPAM",
  "HARASSMENT",
  "HATE",
  "NUDITY",
  "SCAM",
  "COPYRIGHT",
  "OTHER",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REVIEW_STATUSES = ["OPEN", "REVIEWING", "RESOLVED", "DISMISSED"] as const;

export type ReportReviewStatus = (typeof REPORT_REVIEW_STATUSES)[number];

export const OPEN_REPORT_STATUSES = ["OPEN", "REVIEWING"] as const;

export type OpenReportStatus = (typeof OPEN_REPORT_STATUSES)[number];

export function isReportTargetType(value: string): value is ReportTargetType {
  return (REPORT_TARGET_TYPES as readonly string[]).includes(value);
}

export function isReportReason(value: string): value is ReportReason {
  return (REPORT_REASONS as readonly string[]).includes(value);
}
