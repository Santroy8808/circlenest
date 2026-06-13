import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const uploadDir = path.join(process.cwd(), "public", "uploads");

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

const isR2Configured = Boolean(
  R2_ACCOUNT_ID && R2_BUCKET && R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY,
);

const r2Client = isR2Configured
  ? new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID!,
        secretAccessKey: R2_SECRET_ACCESS_KEY!,
      },
    })
  : null;

export function getUploadStorageBackend(): "r2" | "local" {
  return r2Client && R2_BUCKET ? "r2" : "local";
}

export function getR2ConfigSummary() {
  return {
    configured: Boolean(r2Client && R2_BUCKET),
    endpoint: R2_ENDPOINT || null,
    bucket: R2_BUCKET || null,
    accountId: R2_ACCOUNT_ID || null,
  };
}

export async function verifyR2WriteAccess(): Promise<{ ok: boolean; error?: string }> {
  if (!r2Client || !R2_BUCKET) return { ok: false, error: "R2 is not configured at runtime." };

  const key = `_diagnostics/${Date.now()}-${crypto.randomUUID()}.txt`;
  try {
    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: "ok",
        ContentType: "text/plain",
      }),
    );
    await r2Client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function assertUploadBackendAvailable(): void {
  if (process.env.NODE_ENV === "production" && (!r2Client || !R2_BUCKET)) {
    throw new Error("R2 storage is not configured in production. Refusing local upload fallback.");
  }
}

export type UploadPurpose =
  | "profile-avatar"
  | "profile-banner"
  | "gallery-photo"
  | "post-media"
  | "auditor-attachment"
  | "group-photo"
  | "group-post-media"
  | "group-document"
  | "job-listing-photo"
  | "bazaar-listing-photo"
  | "fundraiser-banner"
  | "fundraiser-comment-media"
  | "misc";

type UserUploadContext = {
  ownerType: "user";
  ownerId: string;
  uploaderId: string;
  purpose: Exclude<UploadPurpose, "group-photo" | "group-post-media" | "group-document">;
  albumId?: string | null;
  tags?: string[];
};

type GroupUploadContext = {
  ownerType: "group";
  ownerId: string;
  groupId: string;
  uploaderId: string;
  purpose: Extract<UploadPurpose, "group-photo" | "group-post-media" | "group-document">;
  albumId?: string | null;
  tags?: string[];
};

export type UploadContext = UserUploadContext | GroupUploadContext;

type StoredObject = {
  body: BodyInit;
  contentLength?: number;
  contentType?: string;
  etag?: string;
  lastModified?: Date;
};

function sanitizeSegment(value: string, fallback: string): string {
  const trimmed = value.trim().toLowerCase();
  const normalized = trimmed.replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return normalized || fallback;
}

type FileLike = { name: string; type: string };

function inferExtension(file: FileLike): string {
  const source = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".") + 1) : "";
  const cleaned = source.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (cleaned) return cleaned;
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "application/pdf") return "pdf";
  return "bin";
}

function buildStoredFilename(file: FileLike): string {
  return `${Date.now()}-${crypto.randomUUID()}.${inferExtension(file)}`;
}

function buildStorageKey(context: UploadContext, file: FileLike): string {
  const fileName = buildStoredFilename(file);

  if (context.ownerType === "group") {
    if (context.purpose === "group-document") {
      return ["groups", context.groupId, "documents", context.uploaderId, fileName].join("/");
    }
    if (context.purpose === "group-post-media") {
      return ["groups", context.groupId, "posts", context.uploaderId, fileName].join("/");
    }
    const albumSegment = context.albumId ? sanitizeSegment(context.albumId, "album") : "unassigned";
    return ["groups", context.groupId, "photos", "albums", albumSegment, context.uploaderId, fileName].join("/");
  }

  if (context.purpose === "profile-avatar") {
    return ["users", context.ownerId, "profile", "avatar", fileName].join("/");
  }
  if (context.purpose === "profile-banner") {
    return ["users", context.ownerId, "profile", "banner", fileName].join("/");
  }
  if (context.purpose === "gallery-photo") {
    const albumSegment = context.albumId ? sanitizeSegment(context.albumId, "album") : "unassigned";
    return ["users", context.ownerId, "gallery", "albums", albumSegment, fileName].join("/");
  }
  if (context.purpose === "post-media") {
    return ["users", context.ownerId, "posts", fileName].join("/");
  }
  if (context.purpose === "auditor-attachment") {
    return ["users", context.ownerId, "auditor", "attachments", fileName].join("/");
  }
  if (context.purpose === "job-listing-photo") {
    return ["users", context.ownerId, "jobs", fileName].join("/");
  }
  if (context.purpose === "bazaar-listing-photo") {
    return ["users", context.ownerId, "bazaar", fileName].join("/");
  }
  if (context.purpose === "fundraiser-banner") {
    return ["users", context.ownerId, "fundraisers", "banner", fileName].join("/");
  }
  if (context.purpose === "fundraiser-comment-media") {
    return ["users", context.ownerId, "fundraisers", "comments", fileName].join("/");
  }
  return ["users", context.ownerId, "uploads", fileName].join("/");
}

function buildMetadata(context: UploadContext, file: FileLike) {
  return {
    ownerType: context.ownerType,
    ownerId: context.ownerId,
    uploaderId: context.uploaderId,
    purpose: context.purpose,
    albumId: context.albumId ?? "",
    groupId: context.ownerType === "group" ? context.groupId : "",
    tags: context.tags?.length ? context.tags.join(",") : "",
    originalName: file.name,
    uploadedAt: new Date().toISOString(),
  };
}

function buildManagedMediaUrl(key: string): string {
  return `/api/media/${key.split("/").map((segment) => encodeURIComponent(segment)).join("/")}`;
}

function parseManagedMediaUrl(url: string): string | null {
  if (!url.startsWith("/api/media/")) return null;
  const raw = url.slice("/api/media/".length);
  if (!raw) return null;
  return raw
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .join("/");
}

function parseLocalUploadUrl(url: string): string | null {
  if (!url.startsWith("/uploads/")) return null;
  return url.slice("/uploads/".length).replace(/\\/g, "/");
}

async function saveUploadToLocal(file: File, key: string): Promise<string> {
  const full = path.join(uploadDir, ...key.split("/"));
  await fs.mkdir(path.dirname(full), { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(full, bytes);
  return `/uploads/${key}`;
}

async function deleteUploadFromLocalUrl(url: string): Promise<void> {
  const relative = parseLocalUploadUrl(url);
  if (!relative) return;
  const full = path.join(uploadDir, ...relative.split("/"));
  try {
    await fs.unlink(full);
  } catch {
    // Ignore missing files and best-effort deletes.
  }
}

async function putMarkerObject(key: string): Promise<void> {
  if (r2Client && R2_BUCKET) {
    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: "",
        ContentType: "text/plain",
      }),
    );
    return;
  }

  assertUploadBackendAvailable();

  const full = path.join(uploadDir, ...key.split("/"));
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, "");
}

export async function ensureUserStorageRoot(userId: string): Promise<void> {
  await putMarkerObject(`users/${userId}/.keep`);
}

export async function ensureGroupStorageRoot(groupId: string): Promise<void> {
  await putMarkerObject(`groups/${groupId}/.keep`);
}

export async function saveUpload(file: File, context: UploadContext): Promise<string> {
  const key = buildStorageKey(context, file);

  if (!r2Client || !R2_BUCKET) {
    assertUploadBackendAvailable();
    return saveUploadToLocal(file, key);
  }

  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: Buffer.from(await file.arrayBuffer()),
      ContentType: file.type || "application/octet-stream",
      Metadata: buildMetadata(context, file),
    }),
  );

  return buildManagedMediaUrl(key);
}

export async function saveUploadBuffer(
  buffer: Buffer,
  contentType: string,
  originalName: string,
  context: UploadContext,
): Promise<string> {
  const fileLike: FileLike = { name: originalName, type: contentType || "application/octet-stream" };
  const key = buildStorageKey(context, fileLike);

  if (!r2Client || !R2_BUCKET) {
    assertUploadBackendAvailable();
    const full = path.join(uploadDir, ...key.split("/"));
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buffer);
    return `/uploads/${key}`;
  }

  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: fileLike.type,
      Metadata: buildMetadata(context, fileLike),
    }),
  );

  return buildManagedMediaUrl(key);
}

export async function deleteStoredUpload(url: string): Promise<void> {
  const key = parseManagedMediaUrl(url);
  const legacyKey = parseLocalUploadUrl(url);
  if ((key || legacyKey) && r2Client && R2_BUCKET) {
    try {
      await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key ?? legacyKey! }));
    } catch {
      // Ignore best-effort delete failures.
    }
    return;
  }

  await deleteUploadFromLocalUrl(url);
}

export async function readStoredUpload(url: string): Promise<StoredObject | null> {
  const key = parseManagedMediaUrl(url);
  const legacyKey = parseLocalUploadUrl(url);
  if ((key || legacyKey) && r2Client && R2_BUCKET) {
    try {
      const result = await r2Client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key ?? legacyKey! }));
      if (!result.Body) return null;

      const body =
        typeof result.Body.transformToWebStream === "function"
          ? result.Body.transformToWebStream()
          : Buffer.from(await result.Body.transformToByteArray());

      return {
        body,
        contentLength: result.ContentLength,
        contentType: result.ContentType || "application/octet-stream",
        etag: result.ETag,
        lastModified: result.LastModified,
      };
    } catch {
      return null;
    }
  }

  const relative = parseLocalUploadUrl(url);
  if (!relative) return null;
  const full = path.join(uploadDir, ...relative.split("/"));
  try {
    const [buffer, stat] = await Promise.all([fs.readFile(full), fs.stat(full)]);
    const ext = path.extname(full).toLowerCase();
    const contentType =
      ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".png"
          ? "image/png"
          : ext === ".webp"
            ? "image/webp"
            : ext === ".pdf"
              ? "application/pdf"
              : "application/octet-stream";

    return {
      body: buffer,
      contentLength: stat.size,
      contentType,
      lastModified: stat.mtime,
    };
  } catch {
    return null;
  }
}

export async function storedUploadExists(url: string): Promise<boolean> {
  const key = parseManagedMediaUrl(url);
  const legacyKey = parseLocalUploadUrl(url);
  if ((key || legacyKey) && r2Client && R2_BUCKET) {
    try {
      await r2Client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key ?? legacyKey! }));
      return true;
    } catch {
      return false;
    }
  }

  const relative = parseLocalUploadUrl(url);
  if (!relative) return false;
  try {
    await fs.access(path.join(uploadDir, ...relative.split("/")));
    return true;
  } catch {
    return false;
  }
}

export function isManagedUploadUrl(url: string): boolean {
  return url.startsWith("/api/media/") || url.startsWith("/uploads/");
}

