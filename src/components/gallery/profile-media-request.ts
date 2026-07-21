import {
  readJsonObject,
  stableApiError
} from "@/lib/client/api-response";

export type ProfileMediaTarget = "avatar" | "banner";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const PROFILE_MEDIA_FALLBACK_ERROR = "Could not update profile image. Please try again.";

export async function requestProfileMedia(
  input: { mediaAssetId: string; target: ProfileMediaTarget },
  fetcher: FetchLike = fetch
) {
  try {
    const response = await fetcher("/api/profile/media", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
    if (!response.ok) {
      return {
        ok: false as const,
        error: await stableApiError(response, PROFILE_MEDIA_FALLBACK_ERROR)
      };
    }
    const payload = await readJsonObject(response);
    const expectedMediaUrl = `/api/media/assets/${encodeURIComponent(input.mediaAssetId)}`;
    const profile = payload?.profile;
    const profileRecord = profile && typeof profile === "object" && !Array.isArray(profile)
      ? profile as Record<string, unknown>
      : null;
    const selectedProfileUrl = profileRecord
      ? profileRecord[input.target === "avatar" ? "avatarUrl" : "bannerUrl"]
      : undefined;
    if (
      payload?.ok !== true ||
      payload.mediaUrl !== expectedMediaUrl ||
      selectedProfileUrl !== expectedMediaUrl
    ) {
      return { ok: false as const, error: PROFILE_MEDIA_FALLBACK_ERROR };
    }
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: PROFILE_MEDIA_FALLBACK_ERROR };
  }
}
