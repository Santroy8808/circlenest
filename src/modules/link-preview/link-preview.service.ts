import dns from "node:dns/promises";
import net from "node:net";
import { normalizeExternalLinkUrl } from "./link-preview.shared";
import type { LinkPreviewView } from "./types";

const previewCache = new Map<string, { expiresAt: number; value: LinkPreviewView | null }>();
const cacheTtlMs = 15 * 60 * 1000;
const maxPreviewCacheEntries = 500;
const maxPreviewBytes = 512 * 1024;
const requestTimeoutMs = 6_000;
const maxRedirects = 3;

function decodeHtml(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanMetadata(value: string | null | undefined, maxLength: number) {
  const cleaned = decodeHtml(value ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1).trimEnd()}...` : cleaned;
}

function getAttribute(tag: string, attribute: string) {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const quoted = tag.match(new RegExp(`\\s${escaped}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  if (quoted?.[2] !== undefined) return quoted[2];

  const unquoted = tag.match(new RegExp(`\\s${escaped}\\s*=\\s*([^\\s>]+)`, "i"));
  return unquoted?.[1] ?? null;
}

function metadataValues(html: string) {
  const values = new Map<string, string>();

  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = getAttribute(tag, "property") ?? getAttribute(tag, "name");
    const content = getAttribute(tag, "content");
    if (key && content && !values.has(key.toLowerCase())) {
      values.set(key.toLowerCase(), content);
    }
  }

  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (titleTag?.[1]) values.set("document:title", titleTag[1]);
  return values;
}

function firstValue(values: Map<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = values.get(key);
    if (value) return value;
  }

  return null;
}

function isPrivateIpAddress(address: string): boolean {
  if (net.isIP(address) === 4) {
    const parts = address.split(".").map(Number);
    const [first, second] = parts;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      first >= 224 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && (second === 0 || second === 168)) ||
      (first === 198 && (second === 18 || second === 19 || second === 51)) ||
      (first === 203 && second === 0)
    );
  }

  if (net.isIP(address) === 6) {
    const normalized = address.toLowerCase();
    if (normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("2001:db8")) {
      return true;
    }

    const mappedV4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mappedV4 ? isPrivateIpAddress(mappedV4[1]) : false;
  }

  return true;
}

export function isLinkPreviewUrlAllowed(value: string) {
  const normalized = normalizeExternalLinkUrl(value);
  if (!normalized) return false;

  const url = new URL(normalized);
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (url.port && url.port !== "80" && url.port !== "443") return false;
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) return false;
  return !net.isIP(hostname) || !isPrivateIpAddress(hostname);
}

async function resolvePublicUrl(value: string) {
  if (!isLinkPreviewUrlAllowed(value)) return null;

  const url = new URL(value);
  if (net.isIP(url.hostname)) return url;

  try {
    const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((entry) => isPrivateIpAddress(entry.address))) return null;
    return url;
  } catch {
    return null;
  }
}

async function readResponseText(response: Response) {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxPreviewBytes) return null;
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxPreviewBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(body);
}

function resolveMetadataUrl(value: string | null, pageUrl: URL) {
  if (!value) return null;

  try {
    const resolved = new URL(value, pageUrl).toString();
    return isLinkPreviewUrlAllowed(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

function cachePreview(url: string, value: LinkPreviewView | null) {
  if (previewCache.size >= maxPreviewCacheEntries) {
    for (const [key, entry] of previewCache) {
      if (entry.expiresAt <= Date.now() || previewCache.size >= maxPreviewCacheEntries) previewCache.delete(key);
    }
  }
  previewCache.set(url, { expiresAt: Date.now() + cacheTtlMs, value });
  return value;
}

export async function getLinkPreview(value: string): Promise<LinkPreviewView | null> {
  const normalized = normalizeExternalLinkUrl(value);
  if (!normalized) return null;

  const cached = previewCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) previewCache.delete(normalized);

  let currentUrl = await resolvePublicUrl(normalized);
  if (!currentUrl) return cachePreview(normalized, null);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      const response: Response = await fetch(currentUrl, {
        cache: "no-store",
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "Theta-Space Link Preview/1.0"
        },
        redirect: "manual",
        signal: controller.signal
      });

      if (response.status >= 300 && response.status < 400) {
        const location: string | null = response.headers.get("location");
        const nextUrl: string | null = location ? new URL(location, currentUrl).toString() : null;
        currentUrl = nextUrl ? await resolvePublicUrl(nextUrl) : null;
        if (!currentUrl) return cachePreview(normalized, null);
        continue;
      }

      if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
        return cachePreview(normalized, null);
      }

      const html = await readResponseText(response);
      if (html === null) return cachePreview(normalized, null);
      const values = metadataValues(html);
      const title = cleanMetadata(firstValue(values, ["og:title", "twitter:title", "document:title"]), 180) ?? currentUrl.hostname;
      const description = cleanMetadata(firstValue(values, ["og:description", "twitter:description", "description"]), 260);
      const siteName = cleanMetadata(firstValue(values, ["og:site_name", "twitter:site"]), 80);
      const imageUrl = resolveMetadataUrl(firstValue(values, ["og:image", "twitter:image", "twitter:image:src"]), currentUrl);

      return cachePreview(normalized, {
        description,
        imageUrl,
        siteName,
        title,
        url: currentUrl.toString()
      });
    }

    return cachePreview(normalized, null);
  } catch {
    return cachePreview(normalized, null);
  } finally {
    clearTimeout(timeout);
  }
}
