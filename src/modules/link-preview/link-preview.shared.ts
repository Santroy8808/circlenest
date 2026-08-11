const markdownLinkPattern = /\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/gi;
const plainUrlPattern = /https?:\/\/[^\s<>'"`\])}]+/gi;

function trimPastedUrl(value: string) {
  return value.replace(/[.,!?;:]+$/g, "");
}

export function normalizeExternalLinkUrl(value: string) {
  try {
    const url = new URL(value.trim());

    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || url.hostname.length > 253) return null;

    return url.toString();
  } catch {
    return null;
  }
}

export function extractFirstExternalLink(value: string) {
  const markdownMatch = markdownLinkPattern.exec(value);
  markdownLinkPattern.lastIndex = 0;
  if (markdownMatch?.[1]) return normalizeExternalLinkUrl(markdownMatch[1]);

  const plainMatch = plainUrlPattern.exec(value);
  plainUrlPattern.lastIndex = 0;
  return plainMatch?.[0] ? normalizeExternalLinkUrl(trimPastedUrl(plainMatch[0])) : null;
}

export function getExternalLinkHost(value: string) {
  const normalized = normalizeExternalLinkUrl(value);
  return normalized ? new URL(normalized).hostname.replace(/^www\./i, "") : null;
}
