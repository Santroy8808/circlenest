export const FUNDRAISER_TYPES = ["CHARITY", "ORG", "4D_CAMPAIGN", "OTHER"] as const;

export type FundraiserType = (typeof FUNDRAISER_TYPES)[number];

export function isFundraiserType(value: string): value is FundraiserType {
  return (FUNDRAISER_TYPES as readonly string[]).includes(value);
}

export function formatFundraiserType(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[_-]+/g, " ")
    .toLowerCase();
  if (!normalized) return "Unknown";
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function summarizeText(value: string, limit = 24) {
  const text = value.trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trimEnd()}...`;
}
