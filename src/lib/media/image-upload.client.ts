"use client";

type CompressionOptions = {
  maxEdgePx?: number;
  quality?: number;
  minSavingsBytes?: number;
};

export type CompressionStats = {
  originalBytes: number;
  uploadBytes: number;
  savedBytes: number;
  ratio: number;
  resized: boolean;
  outputType: string;
};

export type UploadImageOptions = {
  purpose?:
    | "profile-avatar"
    | "profile-banner"
    | "gallery-photo"
    | "post-media"
    | "auditor-attachment"
    | "group-photo"
    | "group-post-media"
    | "group-document"
    | "job-listing-photo"
    | "market-listing-photo"
    | "bazaar-listing-photo"
    | "fundraiser-banner"
    | "fundraiser-comment-media";
  groupId?: string;
  albumId?: string;
  tagNames?: string[];
};

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  maxEdgePx: 2048,
  quality: 0.82,
  minSavingsBytes: 8 * 1024,
};

async function yieldToBrowser() {
  await new Promise<void>((resolve) => {
    if (typeof window !== "undefined" && "requestAnimationFrame" in window) {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

function extensionForMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "bin";
}

function replaceExtension(filename: string, ext: string): string {
  const base = filename.includes(".") ? filename.slice(0, filename.lastIndexOf(".")) : filename;
  return `${base}.${ext}`;
}

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image file."));
    };
    image.src = url;
  });
}

async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return await new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function targetDimensions(width: number, height: number, maxEdgePx: number) {
  const maxEdge = Math.max(width, height);
  if (maxEdge <= maxEdgePx) return { width, height, resized: false };
  const scale = maxEdgePx / maxEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    resized: true,
  };
}

export async function compressImageOnDevice(file: File, options?: CompressionOptions): Promise<{ file: File; stats: CompressionStats }> {
  const config = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
  const originalBytes = file.size;

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return {
      file,
      stats: {
        originalBytes,
        uploadBytes: originalBytes,
        savedBytes: 0,
        ratio: 0,
        resized: false,
        outputType: file.type || "application/octet-stream",
      },
    };
  }

  await yieldToBrowser();
  const source = await loadImageFromFile(file);
  const dimensions = targetDimensions(source.naturalWidth, source.naturalHeight, config.maxEdgePx);
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d");
  if (!context) {
    return {
      file,
      stats: {
        originalBytes,
        uploadBytes: originalBytes,
        savedBytes: 0,
        ratio: 0,
        resized: false,
        outputType: file.type || "application/octet-stream",
      },
    };
  }
  await yieldToBrowser();
  context.drawImage(source, 0, 0, dimensions.width, dimensions.height);

  const desiredType = file.type === "image/png" ? "image/png" : file.type === "image/webp" ? "image/webp" : "image/jpeg";
  await yieldToBrowser();
  const blob = await canvasToBlob(canvas, desiredType, config.quality);
  if (!blob) {
    return {
      file,
      stats: {
        originalBytes,
        uploadBytes: originalBytes,
        savedBytes: 0,
        ratio: 0,
        resized: false,
        outputType: file.type || "application/octet-stream",
      },
    };
  }

  const outputType = blob.type || desiredType;
  const compressedFile = new File([blob], replaceExtension(file.name, extensionForMime(outputType)), {
    type: outputType,
    lastModified: Date.now(),
  });
  const savedBytes = Math.max(0, originalBytes - compressedFile.size);
  const shouldUseCompressed = dimensions.resized || savedBytes >= config.minSavingsBytes;

  if (!shouldUseCompressed) {
    return {
      file,
      stats: {
        originalBytes,
        uploadBytes: originalBytes,
        savedBytes: 0,
        ratio: 0,
        resized: false,
        outputType: file.type || "application/octet-stream",
      },
    };
  }

  return {
    file: compressedFile,
    stats: {
      originalBytes,
      uploadBytes: compressedFile.size,
      savedBytes,
      ratio: originalBytes > 0 ? savedBytes / originalBytes : 0,
      resized: dimensions.resized,
      outputType,
    },
  };
}

export async function uploadImageWithCompression(
  file: File,
  options?: UploadImageOptions,
): Promise<{ url: string | null; stats: CompressionStats }> {
  await yieldToBrowser();
  const compressed = await compressImageOnDevice(file);
  const form = new FormData();
  form.append("file", compressed.file);
  if (options?.purpose) form.append("purpose", options.purpose);
  if (options?.groupId) form.append("groupId", options.groupId);
  if (options?.albumId) form.append("albumId", options.albumId);
  if (options?.tagNames?.length) form.append("tagNames", options.tagNames.join(","));
  const response = await fetch("/api/upload", { method: "POST", body: form });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    console.error("Image upload failed", body?.error ?? response.statusText);
    return { url: null, stats: compressed.stats };
  }
  const body = (await response.json()) as { url?: string };
  return { url: body.url ?? null, stats: compressed.stats };
}

export async function uploadFile(
  file: File,
  options?: UploadImageOptions,
): Promise<{ url: string | null }> {
  const form = new FormData();
  form.append("file", file);
  if (options?.purpose) form.append("purpose", options.purpose);
  if (options?.groupId) form.append("groupId", options.groupId);
  if (options?.albumId) form.append("albumId", options.albumId);
  if (options?.tagNames?.length) form.append("tagNames", options.tagNames.join(","));
  const response = await fetch("/api/upload", { method: "POST", body: form });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    console.error("File upload failed", body?.error ?? response.statusText);
    return { url: null };
  }
  const body = (await response.json()) as { url?: string };
  return { url: body.url ?? null };
}
