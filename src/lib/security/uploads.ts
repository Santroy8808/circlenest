const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_DOCUMENT_MIME = new Set([
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export function isSafeImageUpload(file: { size: number; type: string }): boolean {
  if (!ALLOWED_IMAGE_MIME.has(file.type)) return false;
  if (file.size > MAX_IMAGE_BYTES) return false;
  return true;
}

export function isSafeDocumentUpload(file: { size: number; type: string }): boolean {
  if (!ALLOWED_DOCUMENT_MIME.has(file.type)) return false;
  if (file.size > MAX_DOCUMENT_BYTES) return false;
  return true;
}
