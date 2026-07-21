import { MediaAssetStatus, Prisma } from "@prisma/client";

export const MEDIA_ASSET_REFERENCE_UNAVAILABLE_MESSAGE =
  "One or more media files are no longer available.";

export class MediaAssetReferenceFenceError extends Error {
  constructor(message = MEDIA_ASSET_REFERENCE_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = "MediaAssetReferenceFenceError";
  }
}

const MEDIA_ASSET_REFERENCE_DATABASE_SIGNATURES = [
  "Referenced media asset is not available.",
  "Referenced media asset is not ready.",
  "MEDIA_ASSET_REFERENCE_FENCE"
] as const;

function containsMediaAssetReferenceDatabaseSignature(
  value: unknown,
  seen = new Set<object>(),
  depth = 0
): boolean {
  if (typeof value === "string") {
    return MEDIA_ASSET_REFERENCE_DATABASE_SIGNATURES.some((signature) => value.includes(signature));
  }
  if (!value || typeof value !== "object" || depth > 4 || seen.has(value)) return false;

  seen.add(value);
  if (
    value instanceof Error &&
    MEDIA_ASSET_REFERENCE_DATABASE_SIGNATURES.some((signature) => value.message.includes(signature))
  ) {
    return true;
  }

  const record = value as Record<string, unknown>;
  const diagnosticValues = [
    record.message,
    record.meta,
    record.cause,
    record.detail,
    record.constraint,
    record.database_error,
    ...Object.values(record)
  ];
  return diagnosticValues.some((nested) =>
    containsMediaAssetReferenceDatabaseSignature(nested, seen, depth + 1)
  );
}

export function getMediaAssetReferenceErrorMessage(error: unknown) {
  if (
    error instanceof MediaAssetReferenceFenceError ||
    containsMediaAssetReferenceDatabaseSignature(error)
  ) {
    return MEDIA_ASSET_REFERENCE_UNAVAILABLE_MESSAGE;
  }
  return null;
}

export async function withMediaAssetReferenceValidation<T>(operation: () => Promise<T>) {
  try {
    return { ok: true as const, value: await operation() };
  } catch (error) {
    const message = getMediaAssetReferenceErrorMessage(error);
    if (message) return { ok: false as const, error: message };
    throw error;
  }
}

type LockedMediaAssetReference = {
  id: string;
  ownerUserId: string;
  status: MediaAssetStatus;
};

function normalizeMediaAssetIds(mediaAssetIds: readonly string[]) {
  return [...new Set(mediaAssetIds.filter(Boolean))].sort();
}

/**
 * Acquires the same owner -> media-asset lock order used by destructive media
 * operations. Call this inside the transaction that creates the reference.
 */
export async function lockReadyMediaAssetsForReference(
  transaction: Prisma.TransactionClient,
  mediaAssetIds: readonly string[],
  options: { additionalUserIds?: readonly string[] } = {}
) {
  const normalizedIds = normalizeMediaAssetIds(mediaAssetIds);
  const ownership = normalizedIds.length
    ? await transaction.mediaAsset.findMany({
        where: { id: { in: normalizedIds } },
        select: { id: true, ownerUserId: true }
      })
    : [];
  if (ownership.length !== normalizedIds.length) {
    throw new MediaAssetReferenceFenceError();
  }

  const ownerUserIds = [...new Set([
    ...(options.additionalUserIds ?? []).filter(Boolean),
    ...ownership.map((asset) => asset.ownerUserId)
  ])].sort();
  if (ownerUserIds.length === 0) return [] as LockedMediaAssetReference[];

  const lockedOwners = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "User"
    WHERE "id" IN (${Prisma.join(ownerUserIds)})
    ORDER BY "id" ASC
    FOR UPDATE
  `);
  if (lockedOwners.length !== ownerUserIds.length) {
    throw new MediaAssetReferenceFenceError();
  }

  if (normalizedIds.length === 0) return [] as LockedMediaAssetReference[];

  const lockedAssets = await transaction.$queryRaw<LockedMediaAssetReference[]>(Prisma.sql`
    SELECT "id", "ownerUserId", "status"
    FROM "MediaAsset"
    WHERE "id" IN (${Prisma.join(normalizedIds)})
    ORDER BY "id" ASC
    FOR UPDATE
  `);
  const expectedOwners = new Map(ownership.map((asset) => [asset.id, asset.ownerUserId]));
  if (
    lockedAssets.length !== normalizedIds.length ||
    lockedAssets.some((asset, index) => (
      asset.id !== normalizedIds[index] ||
      asset.ownerUserId !== expectedOwners.get(asset.id) ||
      asset.status !== MediaAssetStatus.READY
    ))
  ) {
    throw new MediaAssetReferenceFenceError();
  }

  return lockedAssets;
}
