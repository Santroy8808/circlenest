import { MediaAssetStatus, type Prisma } from "@prisma/client";
import type { PlatformMediaDto, PlatformMediaStatus } from "@/lib/platform/dto";
import { getR2PublicUrl } from "@/lib/platform/r2";

type MediaAssetForDto = {
  id: string;
  publicUrl: string | null;
  storageKey?: string | null;
  metadata: Prisma.JsonValue | null;
  status?: MediaAssetStatus;
};

type MediaMetadata = {
  thumbnailStorageKey?: string | null;
  thumbnailUrl?: string | null;
  width?: number | null;
  height?: number | null;
  altText?: string | null;
};

function readMetadata(value: Prisma.JsonValue | null): MediaMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as MediaMetadata;
}

function toPlatformMediaStatus(status?: MediaAssetStatus): PlatformMediaStatus {
  switch (status) {
    case MediaAssetStatus.CREATED:
      return "created";
    case MediaAssetStatus.UPLOADING:
      return "uploading";
    case MediaAssetStatus.FAILED:
      return "failed";
    case MediaAssetStatus.READY:
    default:
      return "ready";
  }
}

export function toPlatformMediaDto(asset: MediaAssetForDto): PlatformMediaDto {
  const metadata = readMetadata(asset.metadata);
  const assetUrl = asset.publicUrl ?? (asset.storageKey ? getR2PublicUrl(asset.storageKey) : null) ?? `/api/media/assets/${asset.id}`;
  const thumbnailUrl =
    metadata.thumbnailUrl ?? (metadata.thumbnailStorageKey ? getR2PublicUrl(metadata.thumbnailStorageKey) : null) ?? assetUrl;

  return {
    id: asset.id,
    url: assetUrl,
    thumbnailUrl,
    width: typeof metadata.width === "number" ? metadata.width : null,
    height: typeof metadata.height === "number" ? metadata.height : null,
    status: toPlatformMediaStatus(asset.status),
    altText: metadata.altText ?? null
  };
}
