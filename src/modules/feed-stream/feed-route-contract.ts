import type { FeedStreamMode } from "@/modules/feed-stream/feed-stream.service";

export type FeedModeParseResult =
  | { ok: true; mode: FeedStreamMode }
  | { ok: false; error: "Unknown Stream filter." };

export function parseFeedStreamMode(value: string | null | undefined): FeedModeParseResult {
  const mode = value?.trim() || "public";
  if (mode === "public" || mode === "friends") return { ok: true, mode };
  return { ok: false, error: "Unknown Stream filter." };
}
