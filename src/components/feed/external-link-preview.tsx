"use client";

/* External Open Graph images are intentionally rendered without a host allowlist. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { extractFirstExternalLink, getExternalLinkHost } from "@/modules/link-preview/link-preview.shared";
import type { LinkPreviewView } from "@/modules/link-preview/types";

const previewRequests = new Map<string, Promise<LinkPreviewView | null>>();

function isLinkPreviewView(value: unknown): value is LinkPreviewView {
  if (!value || typeof value !== "object") return false;
  const preview = value as Record<string, unknown>;
  return typeof preview.url === "string" && typeof preview.title === "string";
}

async function loadPreview(url: string) {
  const existing = previewRequests.get(url);
  if (existing) return existing;

  const request = fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, { credentials: "same-origin" })
    .then(async (response) => {
      if (!response.ok) return null;
      const payload = await response.json().catch(() => null) as { preview?: unknown } | null;
      return isLinkPreviewView(payload?.preview) ? payload.preview : null;
    })
    .catch(() => null);

  previewRequests.set(url, request);
  return request;
}

export function ExternalLinkPreview({ body }: { body: string }) {
  const url = extractFirstExternalLink(body);
  const [preview, setPreview] = useState<LinkPreviewView | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);

    if (!url) return () => {
      cancelled = true;
    };

    void loadPreview(url).then((result) => {
      if (!cancelled) setPreview(result);
    });

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!url || !preview) return null;

  const host = getExternalLinkHost(preview.url) ?? "External link";

  return (
    <a
      aria-label={`Open preview for ${preview.title}`}
      className="mt-3 flex overflow-hidden rounded-md border border-[rgba(214,178,74,0.3)] bg-[rgba(12,20,33,0.82)] no-underline transition hover:border-[rgba(255,216,95,0.76)] hover:bg-[rgba(21,33,52,0.94)] max-sm:flex-col"
      href={preview.url}
      rel="noreferrer"
      target="_blank"
    >
      {preview.imageUrl ? (
        <img
          alt=""
          className="h-32 w-full shrink-0 object-cover sm:w-44"
          loading="lazy"
          referrerPolicy="no-referrer"
          src={preview.imageUrl}
        />
      ) : null}
      <span className="grid min-w-0 gap-1 p-3">
        <span className="truncate text-[0.7rem] font-extrabold uppercase tracking-[0.14em] text-[var(--gold)]">{preview.siteName ?? host}</span>
        <strong className="line-clamp-2 text-sm leading-5 text-[var(--text)]">{preview.title}</strong>
        {preview.description ? <span className="line-clamp-2 text-xs leading-5 text-[var(--muted)]">{preview.description}</span> : null}
        <span className="truncate text-xs text-[var(--muted)]">{host}</span>
      </span>
    </a>
  );
}
