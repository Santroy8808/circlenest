import { DestructiveActionKind, DestructiveActionStatus, type Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GalleryDeletionQueue, type GalleryDeletionQueueItem } from "@/components/gallery/gallery-deletion-queue";
import { GalleryGrid } from "@/components/gallery/gallery-grid";
import { GalleryProfileBanner } from "@/components/gallery/gallery-profile-banner";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { prisma } from "@/lib/platform/db";
import { timeServerStep } from "@/lib/platform/server-timing";
import { safeListMyPics } from "@/modules/gallery-media-storage/gallery-media-storage.service";
import { galleryDeletionStatusMessage } from "@/components/gallery/gallery-deletion-status";

const TRACKED_DELETION_STATUSES = [
  DestructiveActionStatus.PENDING_CONFIRMATION,
  DestructiveActionStatus.CONFIRMED,
  DestructiveActionStatus.QUEUED,
  DestructiveActionStatus.RUNNING,
  DestructiveActionStatus.FAILED,
  DestructiveActionStatus.CANCELLED
] as const;

function deletionMediaAssetIds(result: Prisma.JsonValue | null) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return [];
  const record = result as Prisma.JsonObject;
  const value = Array.isArray(record.mediaAssetIds) ? record.mediaAssetIds : record.deletedMediaAssetIds;
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))].slice(0, 100);
}

function deletionQueueStatus(status: DestructiveActionStatus): GalleryDeletionQueueItem["status"] | null {
  if (status === DestructiveActionStatus.RUNNING) return "running";
  if (status === DestructiveActionStatus.FAILED) return "failed";
  if (status === DestructiveActionStatus.CANCELLED) return "cancelled";
  if (
    status === DestructiveActionStatus.PENDING_CONFIRMATION ||
    status === DestructiveActionStatus.CONFIRMED ||
    status === DestructiveActionStatus.QUEUED
  ) return "queued";
  return null;
}

function safeDeletionFailureReason(error: string | null) {
  const normalized = error?.toLowerCase() ?? "";
  if (normalized.includes("still in use")) {
    return "A photo is still being used elsewhere. Remove that use before retrying.";
  }
  if (normalized.includes("safety limit") || (normalized.includes("automatic") && normalized.includes("retry"))) {
    return "Automatic retries stopped after repeated storage failures. Confirm Retry to continue.";
  }
  if (["manifest", "reconcile", "invariant", "tombstone", "do not match"].some((term) => normalized.includes(term))) {
    return "Theta-Space could not safely reconcile this deletion. Contact support before trying again.";
  }
  if (normalized.includes("storage") || normalized.includes("r2") || normalized.includes("unavailable")) {
    return "Secure storage was temporarily unavailable. You can retry now or later.";
  }
  return "Theta-Space could not finish secure deletion. Retry, or contact support if it continues.";
}

export default async function MyPicsPage({
  searchParams
}: {
  searchParams: { deletionRequest?: string };
}) {
  const session = await timeServerStep("gallery.auth", auth());

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/profile/gallery");
  }

  const activeActor = await timeServerStep("gallery.actor", getActiveAccountActor(session.user.id));
  const requestedDeletionId = searchParams.deletionRequest?.trim();
  const safeRequestedDeletionId = requestedDeletionId && requestedDeletionId.length <= 180
    ? requestedDeletionId
    : null;
  const [assets, currentActorProfile, requestedDeletion, trackedDeletions] = await Promise.all([
    timeServerStep("gallery.media-list", safeListMyPics(activeActor.actorUserId, 180, { includeSystem: true })),
    prisma.user.findUnique({
      where: { id: activeActor.actorUserId },
      include: { profile: true }
    }),
    safeRequestedDeletionId
      ? prisma.destructiveActionRequest.findFirst({
          where: {
            id: safeRequestedDeletionId,
            requestedByUserId: activeActor.actorUserId,
            kind: DestructiveActionKind.DELETE_MEDIA
          },
          select: { id: true, status: true, result: true }
        })
      : Promise.resolve(null),
    prisma.destructiveActionRequest.findMany({
      where: {
        requestedByUserId: activeActor.actorUserId,
        kind: DestructiveActionKind.DELETE_MEDIA,
        status: { in: [...TRACKED_DELETION_STATUSES] }
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, status: true, result: true, error: true }
    })
  ]);
  const completedDeletionCount = requestedDeletion
    ? deletionMediaAssetIds(requestedDeletion.result).length
    : 0;
  const initialMessage = requestedDeletion?.status === DestructiveActionStatus.SUCCEEDED
    ? galleryDeletionStatusMessage("completed", Math.max(1, completedDeletionCount))
    : "";
  const deletionQueue = trackedDeletions.flatMap((request) => {
    const status = deletionQueueStatus(request.status);
    return status
      ? [{
          id: request.id,
          status,
          mediaAssetIds: deletionMediaAssetIds(request.result),
          ...(status === "failed" || status === "cancelled"
            ? { failureReason: safeDeletionFailureReason(request.error) }
            : {})
        }]
      : [];
  });

  return (
    <AppShell>
      <GalleryProfileBanner bannerUrl={currentActorProfile?.profile?.bannerUrl} subtitle="Gallery" />
      <div className="mt-5">
        <GalleryDeletionQueue requests={deletionQueue} />
        <GalleryGrid
          assets={assets}
          initialMessage={initialMessage}
          messageRevision={requestedDeletion ? `${requestedDeletion.id}:${requestedDeletion.status}` : "none"}
        />
      </div>
    </AppShell>
  );
}
