import archiver from "archiver";
import { createGunzip, gzipSync } from "node:zlib";
import { PassThrough, Readable } from "node:stream";
import sharp from "sharp";
import {
  MediaAssetStatus,
  MembershipStorageArchiveItemStatus,
  MembershipStorageArchiveStatus,
  MembershipTier,
  Prisma
} from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import {
  deleteR2Object,
  getR2Object,
  getR2PublicUrl,
  headR2Object,
  putR2Object,
  putR2Stream,
  type R2ObjectAccess
} from "@/lib/platform/r2";
import type { PlatformJobHandlerContext, PlatformJobHandlerResult } from "@/modules/platform-jobs/platform-jobs.service";

const MODULE_KEY = "membership-storage-archive";
const ARCHIVE_JOB_KIND = "membership.storage-archive.v1";
const VIEW_JOB_KIND = "membership.storage-archive.prepare-view.v1";
const DOWNLOAD_JOB_KIND = "membership.storage-archive.zip.v1";
const VIEW_QUEUE_DELAY_MS = 60_000;
const VIEW_EXPIRY_MS = 15 * 60_000;
const DOWNLOAD_EXPIRY_MS = 7 * 24 * 60 * 60_000;

type ArchiveMetadata = {
  thumbnailStorageKey?: string | null;
  thumbnailUrl?: string | null;
};

function accessForVisibility(visibility: "PUBLIC" | "MEMBERS" | "PRIVATE"): R2ObjectAccess {
  return visibility === "PUBLIC" ? "public" : "private";
}

async function objectToBuffer(body: unknown) {
  const transformer = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof transformer?.transformToByteArray === "function") {
    return Buffer.from(await transformer.transformToByteArray());
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function toNodeReadable(body: unknown) {
  return Readable.from(body as AsyncIterable<Uint8Array | Buffer | string>);
}

function archiveItemKey(archiveId: string, itemId: string, extension: string) {
  return `membership-storage-archives/${archiveId}/items/${itemId}/original.${extension}`;
}

function thumbnailKey(archiveId: string, itemId: string) {
  return `membership-storage-archives/${archiveId}/items/${itemId}/thumbnail.jpg`;
}

function preparedViewKey(archiveId: string, itemId: string) {
  return `membership-storage-archives/${archiveId}/items/${itemId}/prepared/${Date.now()}`;
}

function downloadKey(archiveId: string) {
  return `membership-storage-archives/${archiveId}/downloads/theta-space-media-${archiveId}.zip`;
}

function safeArchiveFileName(value: string | null, position: number, mimeType: string) {
  const base = (value ?? `archived-item-${position + 1}`)
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .trim()
    .slice(0, 160) || `archived-item-${position + 1}`;
  if (base.includes(".")) return base;
  if (mimeType === "image/webp") return `${base}.webp`;
  if (mimeType === "image/jpeg") return `${base}.jpg`;
  return base;
}

function genericThumbnail(label: string) {
  const safe = label.replace(/[<>&"]/g, "").slice(0, 48) || "Archived file";
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240"><rect width="320" height="240" fill="#101827"/><rect x="12" y="12" width="296" height="216" rx="16" fill="none" stroke="#d6b24a"/><text x="160" y="108" fill="#f6d965" font-family="Arial,sans-serif" font-size="18" font-weight="700" text-anchor="middle">Archived file</text><text x="160" y="140" fill="#c5cfdd" font-family="Arial,sans-serif" font-size="13" text-anchor="middle">${safe}</text></svg>`);
}

function isImage(mimeType: string) {
  return /^image\/(jpeg|png|webp|gif|avif|tiff)$/i.test(mimeType);
}

export function selectOldestAssetsForStorageArchive<T extends { sizeBytes: bigint }>(assets: readonly T[], quotaBytes: bigint) {
  const totalBytes = assets.reduce((sum, asset) => sum + asset.sizeBytes, BigInt(0));
  if (totalBytes <= quotaBytes) return { totalBytes, selectedBytes: BigInt(0), selected: [] as T[] };
  const bytesToArchive = totalBytes - quotaBytes;
  let selectedBytes = BigInt(0);
  const selected = assets.filter((asset) => {
    if (selectedBytes >= bytesToArchive) return false;
    selectedBytes += asset.sizeBytes;
    return true;
  });
  return { totalBytes, selectedBytes, selected };
}

async function archivePayload(input: { body: Buffer; mimeType: string; originalName: string | null }) {
  if (isImage(input.mimeType)) {
    const archived = await sharp(input.body, { animated: false })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 38, effort: 6 })
      .toBuffer();
    const thumbnail = await sharp(input.body, { animated: false })
      .rotate()
      .resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 24, progressive: true })
      .toBuffer();
    return {
      archiveBody: archived,
      archiveMimeType: "image/webp",
      archiveCodec: "webp",
      thumbnailBody: thumbnail,
      thumbnailMimeType: "image/jpeg",
      extension: "webp"
    };
  }

  const compressed = gzipSync(input.body, { level: 9 });
  const useCompressed = compressed.length < input.body.length;
  return {
    archiveBody: useCompressed ? compressed : input.body,
    archiveMimeType: "application/octet-stream",
    archiveCodec: useCompressed ? "gzip" : "identity",
    thumbnailBody: genericThumbnail(input.originalName ?? "Archived file"),
    thumbnailMimeType: "image/svg+xml",
    extension: useCompressed ? "gz" : "bin"
  };
}

async function completeArchiveIfFinished(archiveId: string) {
  const [remaining, successful] = await Promise.all([
    prisma.membershipStorageArchiveItem.count({
      where: { archiveId, status: { in: [MembershipStorageArchiveItemStatus.QUEUED, MembershipStorageArchiveItemStatus.PROCESSING] } }
    }),
    prisma.membershipStorageArchiveItem.aggregate({
      where: { archiveId, status: MembershipStorageArchiveItemStatus.READY },
      _sum: { originalSizeBytes: true, archiveSizeBytes: true },
      _count: { _all: true }
    })
  ]);
  if (remaining > 0) return false;

  const status = successful._count._all > 0
    ? MembershipStorageArchiveStatus.READY
    : MembershipStorageArchiveStatus.FAILED;
  await prisma.membershipStorageArchive.update({
    where: { id: archiveId },
    data: {
      status,
      originalBytes: successful._sum.originalSizeBytes ?? BigInt(0),
      archivedBytes: successful._sum.archiveSizeBytes ?? BigInt(0),
      error: status === MembershipStorageArchiveStatus.FAILED ? "Theta-Space could not archive any selected files." : null
    }
  });
  if (status === MembershipStorageArchiveStatus.READY) {
    await prisma.notification.upsert({
      where: { idempotencyKey: `membership-storage-archive-ready:${archiveId}` },
      create: {
        idempotencyKey: `membership-storage-archive-ready:${archiveId}`,
        userId: (await prisma.membershipStorageArchive.findUniqueOrThrow({ where: { id: archiveId }, select: { userId: true } })).userId,
        title: "Your archived media is ready",
        body: "Your older files now use low-storage access. You can prepare one item at a time for viewing or request a ZIP download.",
        href: "/settings/subscription"
      },
      update: {}
    });
  }
  return true;
}

async function queueNextArchiveItem(archiveId: string) {
  const queued = await prisma.membershipStorageArchiveItem.findFirst({
    where: { archiveId, status: MembershipStorageArchiveItemStatus.QUEUED },
    orderBy: { position: "asc" },
    select: { id: true }
  });
  if (!queued) return null;
  return prisma.platformJob.create({
    data: { kind: ARCHIVE_JOB_KIND, payload: { archiveId }, maxAttempts: 5 }
  });
}

export async function queueMembershipStorageArchiveForDowngrade(input: {
  userId: string;
  sourceTier: MembershipTier;
  quotaBytes: bigint;
}) {
  const [existing, assets] = await Promise.all([
    prisma.membershipStorageArchive.findFirst({
      where: { userId: input.userId, status: { in: [MembershipStorageArchiveStatus.QUEUED, MembershipStorageArchiveStatus.PROCESSING] } },
      orderBy: { createdAt: "desc" },
      select: { id: true }
    }),
    prisma.mediaAsset.findMany({
      where: {
        ownerUserId: input.userId,
        status: MediaAssetStatus.READY,
        feedbackTicketScreenshot: { is: null },
        membershipStorageArchiveItem: null
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, storageKey: true, visibility: true, mimeType: true, originalName: true, sizeBytes: true }
    })
  ]);
  if (existing) return { queued: false as const, archiveId: existing.id, reason: "existing" as const };

  const selection = selectOldestAssetsForStorageArchive(assets, input.quotaBytes);
  if (selection.selected.length === 0) return { queued: false as const, archiveId: null, reason: "within-limit" as const };
  const { selected, selectedBytes } = selection;

  const archive = await prisma.$transaction(async (tx) => {
    const created = await tx.membershipStorageArchive.create({
      data: {
        userId: input.userId,
        sourceTier: input.sourceTier,
        quotaBytes: input.quotaBytes,
        originalBytes: selectedBytes,
        selectedAssetCount: selected.length,
        status: MembershipStorageArchiveStatus.QUEUED
      }
    });
    await tx.membershipStorageArchiveItem.createMany({
      data: selected.map((asset, position) => ({
        archiveId: created.id,
        mediaAssetId: asset.id,
        position,
        sourceStorageKey: asset.storageKey,
        sourceVisibility: asset.visibility,
        originalMimeType: asset.mimeType,
        originalName: asset.originalName,
        originalSizeBytes: asset.sizeBytes
      }))
    });
    const job = await tx.platformJob.create({
      data: { kind: ARCHIVE_JOB_KIND, payload: { archiveId: created.id }, maxAttempts: 5 }
    });
    return tx.membershipStorageArchive.update({ where: { id: created.id }, data: { archiveJobId: job.id } });
  });
  return { queued: true as const, archiveId: archive.id, reason: "over-limit" as const };
}

export async function runMembershipStorageArchiveJob(
  job: { payload: Prisma.JsonValue | null },
  context: PlatformJobHandlerContext
): Promise<PlatformJobHandlerResult> {
  const payload = job.payload as { archiveId?: unknown } | null;
  const archiveId = typeof payload?.archiveId === "string" ? payload.archiveId : "";
  if (!archiveId) return { ok: false, error: "Storage archive job is missing its archive id.", retryable: false };

  const item = await prisma.membershipStorageArchiveItem.findFirst({
    where: { archiveId, status: MembershipStorageArchiveItemStatus.QUEUED },
    orderBy: { position: "asc" },
    include: { mediaAsset: true, archive: { select: { status: true } } }
  });
  if (!item) {
    await completeArchiveIfFinished(archiveId);
    return { ok: true, result: { archiveId, state: "complete" } };
  }

  const claimed = await prisma.membershipStorageArchiveItem.updateMany({
    where: { id: item.id, status: MembershipStorageArchiveItemStatus.QUEUED },
    data: { status: MembershipStorageArchiveItemStatus.PROCESSING, error: null }
  });
  if (claimed.count !== 1) return { ok: true, result: { archiveId, state: "reclaimed" } };
  await prisma.membershipStorageArchive.updateMany({
    where: { id: archiveId, status: MembershipStorageArchiveStatus.QUEUED },
    data: { status: MembershipStorageArchiveStatus.PROCESSING }
  });

  try {
    await context.assertLease();
    const object = await getR2Object(item.sourceStorageKey, accessForVisibility(item.sourceVisibility));
    const original = await objectToBuffer(object.Body);
    if (original.length === 0) throw new Error("The original file is empty.");
    const payload = await archivePayload({ body: original, mimeType: item.originalMimeType, originalName: item.originalName });
    const archiveStorageKey = archiveItemKey(archiveId, item.id, payload.extension);
    const previewStorageKey = thumbnailKey(archiveId, item.id);
    await putR2Object({ storageKey: archiveStorageKey, body: payload.archiveBody, mimeType: payload.archiveMimeType, access: "private" });
    await putR2Object({
      storageKey: previewStorageKey,
      body: payload.thumbnailBody,
      mimeType: payload.thumbnailMimeType,
      access: accessForVisibility(item.sourceVisibility)
    });
    await context.assertLease();

    const metadata = (item.mediaAsset.metadata && typeof item.mediaAsset.metadata === "object" && !Array.isArray(item.mediaAsset.metadata)
      ? item.mediaAsset.metadata
      : {}) as Prisma.JsonObject;
    const archiveMetadata: Prisma.JsonObject = {
      ...metadata,
      membershipStorageArchive: {
        archiveId,
        itemId: item.id,
        archivedAt: new Date().toISOString(),
        thumbnailStorageKey: previewStorageKey
      }
    };
    await prisma.$transaction(async (tx) => {
      await tx.membershipStorageArchiveItem.update({
        where: { id: item.id },
        data: {
          status: MembershipStorageArchiveItemStatus.READY,
          archiveStorageKey,
          archiveMimeType: payload.archiveMimeType,
          archiveCodec: payload.archiveCodec,
          archiveSizeBytes: BigInt(payload.archiveBody.length),
          thumbnailStorageKey: previewStorageKey,
          thumbnailMimeType: payload.thumbnailMimeType,
          thumbnailSizeBytes: BigInt(payload.thumbnailBody.length),
          archivedAt: new Date(),
          error: null
        }
      });
      await tx.mediaAsset.update({
        where: { id: item.mediaAssetId },
        data: {
          publicUrl: item.sourceVisibility === "PUBLIC" ? getR2PublicUrl(previewStorageKey) : null,
          metadata: archiveMetadata
        }
      });
    });
    await deleteR2Object(item.sourceStorageKey, accessForVisibility(item.sourceVisibility));
  } catch (error) {
    await prisma.membershipStorageArchiveItem.updateMany({
      where: { id: item.id, status: MembershipStorageArchiveItemStatus.PROCESSING },
      data: { status: MembershipStorageArchiveItemStatus.FAILED, error: error instanceof Error ? error.message.slice(0, 600) : "Archive processing failed." }
    });
  }

  const finished = await completeArchiveIfFinished(archiveId);
  if (!finished) await queueNextArchiveItem(archiveId);
  return { ok: true, result: { archiveId, itemId: item.id } };
}

export async function requestStorageArchiveView(userId: string, itemId: string) {
  const item = await prisma.membershipStorageArchiveItem.findFirst({
    where: { id: itemId, archive: { userId }, status: MembershipStorageArchiveItemStatus.READY },
    include: { archive: { select: { userId: true } } }
  });
  if (!item) return { ok: false as const, error: "Archived file not found." };
  const now = new Date();
  if (item.viewStatus === MembershipStorageArchiveItemStatus.READY && item.viewExpiresAt && item.viewExpiresAt > now) {
    return { ok: true as const, state: "ready" as const, item };
  }
  const activeView = await prisma.membershipStorageArchiveItem.findFirst({
    where: {
      archive: { userId },
      id: { not: item.id },
      OR: [
        { viewStatus: MembershipStorageArchiveItemStatus.PROCESSING },
        { viewStatus: MembershipStorageArchiveItemStatus.READY, viewExpiresAt: { gt: now } }
      ]
    },
    select: { id: true, originalName: true }
  });
  if (activeView) {
    return { ok: false as const, error: `Finish viewing ${activeView.originalName ?? "the prepared file"} before preparing another archived file.` };
  }
  if (item.viewStatus === MembershipStorageArchiveItemStatus.PROCESSING) return { ok: true as const, state: "queued" as const, item };
  const job = await prisma.platformJob.create({
    data: {
      kind: VIEW_JOB_KIND,
      payload: { itemId: item.id },
      runAfter: new Date(now.getTime() + VIEW_QUEUE_DELAY_MS),
      maxAttempts: 3
    }
  });
  await prisma.membershipStorageArchiveItem.update({
    where: { id: item.id },
    data: { viewStatus: MembershipStorageArchiveItemStatus.PROCESSING, viewJobId: job.id, viewStorageKey: null, viewMimeType: null, viewExpiresAt: null, error: null }
  });
  return { ok: true as const, state: "queued" as const, item: { ...item, viewStatus: MembershipStorageArchiveItemStatus.PROCESSING } };
}

export async function releaseStorageArchiveView(userId: string, itemId: string) {
  const item = await prisma.membershipStorageArchiveItem.findFirst({ where: { id: itemId, archive: { userId } }, select: { id: true, viewStorageKey: true } });
  if (!item) return { ok: false as const, error: "Archived file not found." };
  if (item.viewStorageKey) await deleteR2Object(item.viewStorageKey, "private").catch(() => undefined);
  await prisma.membershipStorageArchiveItem.update({
    where: { id: item.id },
    data: { viewStatus: MembershipStorageArchiveItemStatus.QUEUED, viewStorageKey: null, viewMimeType: null, viewExpiresAt: null, viewJobId: null }
  });
  return { ok: true as const };
}

export async function runStorageArchiveViewJob(
  job: { payload: Prisma.JsonValue | null },
  context: PlatformJobHandlerContext
): Promise<PlatformJobHandlerResult> {
  const payload = job.payload as { itemId?: unknown } | null;
  const itemId = typeof payload?.itemId === "string" ? payload.itemId : "";
  const item = itemId ? await prisma.membershipStorageArchiveItem.findUnique({ where: { id: itemId } }) : null;
  if (!item || !item.archiveStorageKey || !item.archiveMimeType || !item.archiveCodec) {
    return { ok: false, error: "Archived file is not available for viewing.", retryable: false };
  }
  try {
    await context.assertLease();
    const object = await getR2Object(item.archiveStorageKey, "private");
    const archiveBody = await objectToBuffer(object.Body);
    const restored = item.archiveCodec === "gzip" ? await new Promise<Buffer>((resolve, reject) => {
      const output: Buffer[] = [];
      const gunzip = createGunzip();
      gunzip.on("data", (chunk: Buffer) => output.push(Buffer.from(chunk)));
      gunzip.on("error", reject);
      gunzip.on("end", () => resolve(Buffer.concat(output)));
      gunzip.end(archiveBody);
    }) : archiveBody;
    const storageKey = preparedViewKey(item.archiveId, item.id);
    const mimeType = item.archiveCodec === "gzip" ? item.originalMimeType : item.archiveMimeType;
    await putR2Object({ storageKey, body: restored, mimeType, access: "private" });
    await prisma.membershipStorageArchiveItem.update({
      where: { id: item.id },
      data: { viewStatus: MembershipStorageArchiveItemStatus.READY, viewStorageKey: storageKey, viewMimeType: mimeType, viewExpiresAt: new Date(Date.now() + VIEW_EXPIRY_MS), error: null }
    });
    return { ok: true, result: { itemId: item.id, ready: true } };
  } catch (error) {
    await prisma.membershipStorageArchiveItem.updateMany({
      where: { id: item.id },
      data: { viewStatus: MembershipStorageArchiveItemStatus.FAILED, error: error instanceof Error ? error.message.slice(0, 600) : "Could not prepare archived file." }
    });
    return { ok: true, result: { itemId: item.id, ready: false } };
  }
}

export async function requestStorageArchiveDownload(userId: string, archiveId: string) {
  const archive = await prisma.membershipStorageArchive.findFirst({
    where: { id: archiveId, userId, status: MembershipStorageArchiveStatus.READY },
    select: { id: true, downloadStatus: true, downloadExpiresAt: true, downloadStorageKey: true, downloadJobId: true }
  });
  if (!archive) return { ok: false as const, error: "Storage archive is not ready." };
  const now = new Date();
  if (archive.downloadStatus === MembershipStorageArchiveStatus.READY && archive.downloadStorageKey && archive.downloadExpiresAt && archive.downloadExpiresAt > now) {
    return { ok: true as const, state: "ready" as const };
  }
  if (archive.downloadStatus === MembershipStorageArchiveStatus.PROCESSING) return { ok: true as const, state: "queued" as const };
  const job = await prisma.platformJob.create({ data: { kind: DOWNLOAD_JOB_KIND, payload: { archiveId }, maxAttempts: 3 } });
  await prisma.membershipStorageArchive.update({
    where: { id: archive.id },
    data: { downloadStatus: MembershipStorageArchiveStatus.PROCESSING, downloadJobId: job.id, downloadStorageKey: null, downloadSizeBytes: null, downloadExpiresAt: null, downloadReadyAt: null, error: null }
  });
  return { ok: true as const, state: "queued" as const };
}

export async function runStorageArchiveDownloadJob(
  job: { payload: Prisma.JsonValue | null },
  context: PlatformJobHandlerContext
): Promise<PlatformJobHandlerResult> {
  const payload = job.payload as { archiveId?: unknown } | null;
  const archiveId = typeof payload?.archiveId === "string" ? payload.archiveId : "";
  const archive = archiveId ? await prisma.membershipStorageArchive.findUnique({
    where: { id: archiveId },
    include: { items: { where: { status: MembershipStorageArchiveItemStatus.READY }, orderBy: { position: "asc" } } }
  }) : null;
  if (!archive || archive.items.length === 0) return { ok: false, error: "No archived files are available for ZIP download.", retryable: false };

  try {
    const stream = new PassThrough();
    const upload = putR2Stream({ storageKey: downloadKey(archive.id), body: stream, mimeType: "application/zip", access: "private" });
    const zip = archiver("zip", { zlib: { level: 9 } });
    zip.on("error", (error) => stream.destroy(error));
    zip.pipe(stream);
    for (const item of archive.items) {
      await context.assertLease();
      if (!item.archiveStorageKey || !item.archiveMimeType || !item.archiveCodec) continue;
      const object = await getR2Object(item.archiveStorageKey, "private");
      const contents = toNodeReadable(object.Body);
      const payloadStream = item.archiveCodec === "gzip" ? contents.pipe(createGunzip()) : contents;
      zip.append(payloadStream, { name: safeArchiveFileName(item.originalName, item.position, item.archiveMimeType) });
    }
    await zip.finalize();
    await upload;
    const storageKey = downloadKey(archive.id);
    const object = await headR2Object(storageKey, "private");
    const bytes = object.ContentLength ?? 0;
    const expiresAt = new Date(Date.now() + DOWNLOAD_EXPIRY_MS);
    await prisma.$transaction(async (tx) => {
      await tx.membershipStorageArchive.update({
        where: { id: archive.id },
        data: { downloadStatus: MembershipStorageArchiveStatus.READY, downloadStorageKey: storageKey, downloadSizeBytes: BigInt(bytes), downloadExpiresAt: expiresAt, downloadReadyAt: new Date(), error: null }
      });
      await tx.notification.upsert({
        where: { idempotencyKey: `membership-storage-archive-download:${archive.id}` },
        create: {
          idempotencyKey: `membership-storage-archive-download:${archive.id}`,
          userId: archive.userId,
          title: "Your archived media download is ready",
          body: "Your ZIP file is ready. It will remain available for seven days.",
          href: "/settings/subscription"
        },
        update: { body: "Your ZIP file is ready. It will remain available for seven days.", href: "/settings/subscription", readAt: null }
      });
    });
    return { ok: true, result: { archiveId: archive.id, ready: true } };
  } catch (error) {
    await prisma.membershipStorageArchive.updateMany({
      where: { id: archiveId },
      data: { downloadStatus: MembershipStorageArchiveStatus.FAILED, error: error instanceof Error ? error.message.slice(0, 600) : "Could not build ZIP download." }
    });
    return { ok: true, result: { archiveId, ready: false } };
  }
}

export async function getStorageArchiveView(userId: string) {
  const archive = await prisma.membershipStorageArchive.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { items: { orderBy: { position: "asc" } } }
  });
  if (!archive) return null;
  return {
    id: archive.id,
    status: archive.status,
    selectedAssetCount: archive.selectedAssetCount,
    originalBytes: archive.originalBytes.toString(),
    archivedBytes: archive.archivedBytes.toString(),
    downloadStatus: archive.downloadStatus,
    downloadExpiresAt: archive.downloadExpiresAt?.toISOString() ?? null,
    downloadReady: Boolean(archive.downloadStorageKey && archive.downloadExpiresAt && archive.downloadExpiresAt > new Date()),
    items: archive.items.map((item) => ({
      id: item.id,
      mediaAssetId: item.mediaAssetId,
      originalName: item.originalName,
      originalMimeType: item.originalMimeType,
      status: item.status,
      viewStatus: item.viewStatus,
      viewExpiresAt: item.viewExpiresAt?.toISOString() ?? null,
      readyForView: Boolean(item.viewStorageKey && item.viewExpiresAt && item.viewExpiresAt > new Date())
    }))
  };
}

export async function getStorageArchiveDownloadForUser(userId: string, archiveId: string) {
  return prisma.membershipStorageArchive.findFirst({
    where: { id: archiveId, userId, downloadStatus: MembershipStorageArchiveStatus.READY, downloadExpiresAt: { gt: new Date() } },
    select: { downloadStorageKey: true, downloadSizeBytes: true }
  });
}

export async function getStorageArchiveViewForUser(userId: string, itemId: string) {
  return prisma.membershipStorageArchiveItem.findFirst({
    where: { id: itemId, archive: { userId }, viewStatus: MembershipStorageArchiveItemStatus.READY, viewExpiresAt: { gt: new Date() } },
    select: { viewStorageKey: true, viewMimeType: true, originalName: true }
  });
}

export async function expireMembershipStorageArchiveTemporaryFiles(take = 25, now = new Date()) {
  const [views, downloads] = await Promise.all([
    prisma.membershipStorageArchiveItem.findMany({
      where: { viewStorageKey: { not: null }, viewExpiresAt: { lte: now } },
      orderBy: { viewExpiresAt: "asc" },
      take,
      select: { id: true, viewStorageKey: true }
    }),
    prisma.membershipStorageArchive.findMany({
      where: { downloadStorageKey: { not: null }, downloadExpiresAt: { lte: now } },
      orderBy: { downloadExpiresAt: "asc" },
      take,
      select: { id: true, downloadStorageKey: true }
    })
  ]);
  for (const view of views) {
    if (view.viewStorageKey) await deleteR2Object(view.viewStorageKey, "private").catch(() => undefined);
    await prisma.membershipStorageArchiveItem.updateMany({
      where: { id: view.id, viewExpiresAt: { lte: now } },
      data: { viewStatus: MembershipStorageArchiveItemStatus.QUEUED, viewStorageKey: null, viewMimeType: null, viewExpiresAt: null, viewJobId: null }
    });
  }
  for (const download of downloads) {
    if (download.downloadStorageKey) await deleteR2Object(download.downloadStorageKey, "private").catch(() => undefined);
    await prisma.membershipStorageArchive.updateMany({
      where: { id: download.id, downloadExpiresAt: { lte: now } },
      data: { downloadStatus: MembershipStorageArchiveStatus.QUEUED, downloadStorageKey: null, downloadSizeBytes: null, downloadExpiresAt: null, downloadReadyAt: null, downloadJobId: null }
    });
  }
  return { expiredViews: views.length, expiredDownloads: downloads.length };
}

export const membershipStorageArchiveJobKinds = { ARCHIVE_JOB_KIND, VIEW_JOB_KIND, DOWNLOAD_JOB_KIND, MODULE_KEY };
