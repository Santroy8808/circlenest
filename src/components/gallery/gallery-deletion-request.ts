import {
  readJsonObject,
  stableErrorFromPayload
} from "@/lib/client/api-response";
import { withDeletePassword } from "@/lib/client/delete-password";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const DELETE_FALLBACK_ERROR = "Could not queue photo deletion. Please try again.";

export async function requestGalleryAssetDeletion(
  input: { mediaAssetIds: string[]; deletePassword: string },
  fetcher: FetchLike = fetch
) {
  const requestedMediaAssetIds = [...new Set(input.mediaAssetIds.filter(Boolean))].sort();
  if (requestedMediaAssetIds.length === 0) {
    return { ok: false as const, error: DELETE_FALLBACK_ERROR };
  }

  try {
    const response = await fetcher("/api/media/assets/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withDeletePassword({ mediaAssetIds: requestedMediaAssetIds }, input.deletePassword))
    });
    const payload = await readJsonObject(response);

    if (!response.ok) {
      return {
        ok: false as const,
        error: stableErrorFromPayload(payload, DELETE_FALLBACK_ERROR)
      };
    }

    const status = payload?.status;
    const mediaAssetIds = payload?.mediaAssetIds;
    if (
      payload?.ok !== true ||
      (status !== "queued" && status !== "completed") ||
      typeof payload.destructiveActionRequestId !== "string" ||
      payload.destructiveActionRequestId.length === 0 ||
      (status === "queued" && (typeof payload.platformJobId !== "string" || payload.platformJobId.length === 0)) ||
      !Array.isArray(mediaAssetIds) ||
      mediaAssetIds.length === 0 ||
      mediaAssetIds.some((mediaAssetId) => typeof mediaAssetId !== "string") ||
      JSON.stringify([...mediaAssetIds].sort()) !== JSON.stringify(requestedMediaAssetIds)
    ) {
      return { ok: false as const, error: DELETE_FALLBACK_ERROR };
    }

    return {
      ok: true as const,
      status: status as "queued" | "completed",
      mediaAssetIds: mediaAssetIds as string[],
      destructiveActionRequestId: payload.destructiveActionRequestId,
      platformJobId: typeof payload.platformJobId === "string" ? payload.platformJobId : null
    };
  } catch {
    return { ok: false as const, error: DELETE_FALLBACK_ERROR };
  }
}
