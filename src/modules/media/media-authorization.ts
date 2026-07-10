import { MediaVisibility } from "@prisma/client";

export type MediaAccessAsset = {
  ownerUserId: string;
  visibility: MediaVisibility;
};

export type MediaAccessInput = {
  asset: MediaAccessAsset;
  viewerUserId?: string | null;
  /**
   * User IDs whose membership in the private attachment's owning context has
   * already been proven (for example chat participants or group members).
   */
  authorizedPrivateMemberUserIds?: Iterable<string>;
};

export type MediaAccessDecision =
  | { allowed: true; reason: "public" | "owner" | "member" | "authorized-private-member" }
  | { allowed: false; reason: "authentication-required" | "private" };

function includesUser(userIds: Iterable<string> | undefined, userId: string) {
  if (!userIds) return false;

  for (const candidate of userIds) {
    if (candidate === userId) return true;
  }

  return false;
}

export function authorizeMediaAccess(input: MediaAccessInput): MediaAccessDecision {
  if (input.asset.visibility === MediaVisibility.PUBLIC) {
    return { allowed: true, reason: "public" };
  }

  const viewerUserId = input.viewerUserId?.trim();
  if (!viewerUserId) {
    return { allowed: false, reason: "authentication-required" };
  }

  if (input.asset.ownerUserId === viewerUserId) {
    return { allowed: true, reason: "owner" };
  }

  if (input.asset.visibility === MediaVisibility.MEMBERS) {
    return { allowed: true, reason: "member" };
  }

  if (includesUser(input.authorizedPrivateMemberUserIds, viewerUserId)) {
    return { allowed: true, reason: "authorized-private-member" };
  }

  return { allowed: false, reason: "private" };
}

export function canAccessMedia(input: MediaAccessInput) {
  return authorizeMediaAccess(input).allowed;
}

export function mediaAssetDeliveryPath(mediaAssetId: string) {
  return `/api/media/assets/${encodeURIComponent(mediaAssetId)}`;
}

export class MediaAccessDeniedError extends Error {
  readonly code = "MEDIA_ACCESS_DENIED";

  constructor() {
    super("Media was not found or is not available to this member.");
    this.name = "MediaAccessDeniedError";
  }
}

export function requireMediaAccess(input: MediaAccessInput) {
  const decision = authorizeMediaAccess(input);

  if (!decision.allowed) {
    throw new MediaAccessDeniedError();
  }

  return decision;
}
