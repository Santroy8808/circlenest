const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function isSafeImageUpload(file: { size: number; type: string }): boolean {
  if (!ALLOWED_IMAGE_MIME.has(file.type)) return false;
  if (file.size > MAX_IMAGE_BYTES) return false;
  return true;
}
