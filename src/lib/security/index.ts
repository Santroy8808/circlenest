import sanitizeHtml from "sanitize-html";

export function sanitizeUserText(input: string): string {
  return sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} }).trim();
}

export async function checkRateLimitPlaceholder(_key: string): Promise<boolean> {
  return true;
}
