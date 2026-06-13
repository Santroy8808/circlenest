export const CURRENT_TERMS_VERSION = "2026-06-04";

export function hasAcceptedCurrentTerms(version: string | null | undefined) {
  return typeof version === "string" && version.trim() === CURRENT_TERMS_VERSION;
}
