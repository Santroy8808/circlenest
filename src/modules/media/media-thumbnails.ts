import { prisma } from "@/lib/platform/db";

type MediaThumbnailMetadata = {
  thumbnailUrl?: string | null;
};

const internalMediaAssetPattern = /^\/api\/media\/assets\/([a-zA-Z0-9_-]+)$/;

export async function resolvePreferredThumbnailUrls(urls: Array<string | null | undefined>) {
  const cleanUrls = Array.from(new Set(urls.filter((url): url is string => Boolean(url))));

  if (cleanUrls.length === 0) return new Map<string, string>();

  const internalIds = cleanUrls
    .map((url) => internalMediaAssetPattern.exec(url)?.[1])
    .filter((id): id is string => Boolean(id));
  const publicUrls = cleanUrls.filter((url) => !internalMediaAssetPattern.test(url));

  const assets = await prisma.mediaAsset.findMany({
    where: {
      OR: [{ id: { in: internalIds } }, { publicUrl: { in: publicUrls } }]
    },
    select: {
      id: true,
      publicUrl: true,
      metadata: true
    }
  });
  const resolved = new Map<string, string>();

  for (const asset of assets) {
    const metadata = asset.metadata as MediaThumbnailMetadata | null;
    const thumbnailUrl = metadata?.thumbnailUrl;

    if (!thumbnailUrl) continue;

    resolved.set(`/api/media/assets/${asset.id}`, thumbnailUrl);
    if (asset.publicUrl) resolved.set(asset.publicUrl, thumbnailUrl);
  }

  return resolved;
}
