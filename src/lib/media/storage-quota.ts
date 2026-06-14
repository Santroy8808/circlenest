import { prisma } from "@/lib/db/prisma";
import { getStorageLimitBytes, resolveUserAccessPolicy } from "@/lib/policy/tier-policy";
import { deleteStoredUpload, isManagedUploadUrl } from "@/lib/security/upload-storage";

export const ACCOUNT_UPLOAD_LIMIT_BYTES = 100 * 1024 * 1024;

export async function getUserUploadLimitBytes(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, subscriptionTier: true },
  });
  return getStorageLimitBytes(resolveUserAccessPolicy(user));
}

export async function getUserUploadUsageBytes(userId: string): Promise<number> {
  const aggregate = await prisma.userUploadAsset.aggregate({
    where: { userId },
    _sum: { sizeBytes: true },
  });
  return aggregate._sum.sizeBytes ?? 0;
}

export async function canUserStoreBytes(userId: string, incomingBytes: number, limitBytes?: number) {
  const resolvedLimitBytes = typeof limitBytes === "number" ? limitBytes : await getUserUploadLimitBytes(userId);
  const usedBytes = await getUserUploadUsageBytes(userId);
  const nextBytes = usedBytes + Math.max(0, incomingBytes);
  const remainingBytes = Math.max(0, resolvedLimitBytes - usedBytes);
  return {
    ok: nextBytes <= resolvedLimitBytes,
    usedBytes,
    nextBytes,
    remainingBytes,
    limitBytes: resolvedLimitBytes,
  };
}

export async function trackUserUploadAsset(
  userId: string,
  url: string,
  sizeBytes: number,
  mimeType: string,
) {
  await prisma.userUploadAsset.create({
    data: {
      userId,
      url,
      sizeBytes: Math.max(0, Math.floor(sizeBytes)),
      mimeType: mimeType || "application/octet-stream",
    },
  });
}

export async function tryReleaseUserUploadAsset(userId: string, url: string) {
  if (!isManagedUploadUrl(url)) return;

  const [photoRef, profileRef, postImageRef, postMediaRef, groupPhotoRef, marketListingRef] = await Promise.all([
    prisma.photo.findFirst({ where: { url, album: { userId } }, select: { id: true } }),
    prisma.profile.findFirst({
      where: {
        userId,
        OR: [{ avatarUrl: url }, { bannerUrl: url }],
      },
      select: { id: true },
    }),
    prisma.post.findFirst({ where: { authorId: userId, imageUrl: url }, select: { id: true } }),
    prisma.post.findFirst({ where: { authorId: userId, mediaUrlsJson: { contains: url } }, select: { id: true } }),
    prisma.groupPhoto.findFirst({ where: { uploaderId: userId, url }, select: { id: true } }),
    prisma.bazaarListing.findFirst({ where: { sellerId: userId, imageUrlsJson: { contains: url } }, select: { id: true } }),
  ]);

  if (photoRef || profileRef || postImageRef || postMediaRef || groupPhotoRef || marketListingRef) return;

  const removed = await prisma.userUploadAsset.deleteMany({
    where: { userId, url },
  });
  if (removed.count > 0) {
    await deleteStoredUpload(url);
  }
}
