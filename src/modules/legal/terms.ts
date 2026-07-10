import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export const CURRENT_TERMS_VERSION = "2026-07-10";
export const CURRENT_TERMS_EFFECTIVE_DATE = "2026-07-10T00:00:00.000Z";
export const CURRENT_TERMS_EFFECTIVE_DATE_LABEL = "July 10, 2026";
export const TERMS_TITLE = "Theta-Space Terms of Service";
export const TERMS_PDF_FILENAME = "theta-space-terms-of-service-2026-07-10.pdf";
export const TERMS_PDF_PUBLIC_PATH = `/legal/${TERMS_PDF_FILENAME}`;
export const TERMS_PAGE_PATH = "/terms";

const termsTextPath = path.join(process.cwd(), "content", "legal", "terms-of-service-2026-07-10.txt");
const termsPdfPath = path.join(process.cwd(), "public", "legal", TERMS_PDF_FILENAME);

export function readCurrentTermsText() {
  return readFileSync(termsTextPath, "utf8");
}

export function readCurrentTermsPdf() {
  return readFileSync(termsPdfPath);
}

export function getCurrentTermsPdfSha256() {
  return createHash("sha256").update(readCurrentTermsPdf()).digest("hex");
}

export function currentTermsSummary() {
  return {
    title: TERMS_TITLE,
    version: CURRENT_TERMS_VERSION,
    effectiveDate: new Date(CURRENT_TERMS_EFFECTIVE_DATE),
    effectiveDateLabel: CURRENT_TERMS_EFFECTIVE_DATE_LABEL,
    pagePath: TERMS_PAGE_PATH,
    pdfFilename: TERMS_PDF_FILENAME,
    pdfPath: TERMS_PDF_PUBLIC_PATH
  };
}
