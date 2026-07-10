"use client";

import { MediaVisibility } from "@prisma/client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { uploadWithResilientFallback } from "@/lib/client/resilient-upload";

type GalleryAccessSettings = {
  visibility: MediaVisibility;
  commentsEnabled: boolean;
};

export type BackgroundGalleryUploadItem = {
  id: string;
  file: File;
  previewUrl: string;
  assetId?: string;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};

type UploadNotice = {
  id: string;
  title: string;
  body: string;
  href?: string;
};

type DurableUploadIntentResponse = {
  error?: string;
  intentId?: string;
  uploadUrl?: string;
  uploadHeaders?: Record<string, string>;
  storageKey?: string;
};

type BackgroundGalleryUploadContextValue = {
  items: BackgroundGalleryUploadItem[];
  isUploading: boolean;
  notice: UploadNotice | null;
  addFiles: (files: FileList | File[]) => void;
  addFilesAndUpload: (files: FileList | File[], settings: GalleryAccessSettings) => void;
  clearFinished: () => void;
  dismissNotice: () => void;
  uploadAll: (settings: GalleryAccessSettings) => void;
};

const OPTIMIZE_IMAGE_BYTES = 1.5 * 1024 * 1024;
const OPTIMIZE_IMAGE_MAX_EDGE = 1920;
const THUMBNAIL_IMAGE_MAX_EDGE = 420;
const BackgroundGalleryUploadContext = createContext<BackgroundGalleryUploadContextValue | null>(null);

async function readJsonResponse<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text.trim()) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function loadImageElement(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not optimize image before upload."));
    image.src = url;
  });
}

async function optimizeImageForUpload(file: File) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < OPTIMIZE_IMAGE_BYTES) return file;

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImageElement(objectUrl);
    const scale = Math.min(1, OPTIMIZE_IMAGE_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) return file;

    context.drawImage(image, 0, 0, width, height);

    const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outputType, 0.82));

    if (!blob || blob.size >= file.size) return file;

    const extension = outputType === "image/png" ? "png" : "jpg";
    const fileName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${fileName}.${extension}`, { type: outputType, lastModified: file.lastModified });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function createThumbnailForUpload(file: File) {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return null;

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImageElement(objectUrl);
    const scale = Math.min(1, THUMBNAIL_IMAGE_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) return null;

    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));

    if (!blob) return null;

    const fileName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${fileName}-thumb.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function createUploadNotification(input: { uploaded: number; failed: number }) {
  await fetch("/api/media/upload-complete-notification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }).catch(() => null);
}

function createQueuedUploadItems(files: FileList | File[]) {
  return Array.from(files).map((file) => ({
    id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
    file,
    previewUrl: URL.createObjectURL(file),
    progress: 0,
    status: "queued" as const
  }));
}

export function BackgroundGalleryUploadProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<BackgroundGalleryUploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [notice, setNotice] = useState<UploadNotice | null>(null);
  const itemsRef = useRef<BackgroundGalleryUploadItem[]>([]);
  const uploadInProgressRef = useRef(false);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    if (!isUploading) return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [isUploading]);

  const updateItem = useCallback((id: string, patch: Partial<BackgroundGalleryUploadItem>) => {
    setItems((current) => {
      const updated = current.map((item) => (item.id === id ? { ...item, ...patch } : item));
      itemsRef.current = updated;
      return updated;
    });
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    const next = createQueuedUploadItems(files);

    setItems((current) => {
      const updated = [...current, ...next];
      itemsRef.current = updated;
      return updated;
    });
  }, []);

  const clearFinished = useCallback(() => {
    setItems((current) => {
      const keep = current.filter((item) => item.status !== "done");
      current
        .filter((item) => item.status === "done")
        .forEach((item) => URL.revokeObjectURL(item.previewUrl));
      itemsRef.current = keep;
      return keep;
    });
  }, []);

  const dismissNotice = useCallback(() => setNotice(null), []);

  const uploadAll = useCallback(
    (settings: GalleryAccessSettings) => {
      if (uploadInProgressRef.current) return;

      uploadInProgressRef.current = true;
      setIsUploading(true);

      void (async () => {
        let uploaded = 0;
        let failed = 0;
        let batchItems = itemsRef.current.filter((candidate) => candidate.status !== "done");

        while (batchItems.length > 0) {
          for (const item of batchItems) {
            try {
              updateItem(item.id, { status: "uploading", progress: 1, error: undefined });
              const uploadFile = await optimizeImageForUpload(item.file);
              let thumbnailIntentId: string | undefined;
              let thumbnailStorageKey: string | undefined;
              const intentResponse = await fetch("/api/media/upload-intent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  fileName: uploadFile.name,
                  mimeType: uploadFile.type,
                  sizeBytes: uploadFile.size,
                  visibility: settings.visibility,
                  source: "GALLERY"
                })
              });
              const intent = await readJsonResponse<DurableUploadIntentResponse>(intentResponse);

              if (
                !intentResponse.ok ||
                !intent?.intentId ||
                !intent.uploadUrl ||
                !intent.uploadHeaders ||
                !intent.storageKey
              ) {
                throw new Error(intent?.error ?? "Could not prepare upload.");
              }

              await uploadWithResilientFallback({
                uploadUrl: intent.uploadUrl,
                storageKey: intent.storageKey,
                uploadHeaders: intent.uploadHeaders,
                file: uploadFile,
                onProgress: (progress) => updateItem(item.id, { progress })
              });

              updateItem(item.id, { progress: 96 });

              try {
                const thumbnailFile = await createThumbnailForUpload(item.file);

                if (thumbnailFile) {
                  const thumbnailIntentResponse = await fetch("/api/media/upload-intent", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      fileName: thumbnailFile.name,
                      mimeType: thumbnailFile.type,
                      sizeBytes: thumbnailFile.size,
                      visibility: settings.visibility,
                      source: "GALLERY"
                    })
                  });
                  const thumbnailIntent = await readJsonResponse<DurableUploadIntentResponse>(thumbnailIntentResponse);

                  if (
                    thumbnailIntentResponse.ok &&
                    thumbnailIntent?.intentId &&
                    thumbnailIntent.uploadUrl &&
                    thumbnailIntent.uploadHeaders &&
                    thumbnailIntent.storageKey
                  ) {
                    await uploadWithResilientFallback({
                      uploadUrl: thumbnailIntent.uploadUrl,
                      storageKey: thumbnailIntent.storageKey,
                      uploadHeaders: thumbnailIntent.uploadHeaders,
                      file: thumbnailFile,
                      onProgress: () => updateItem(item.id, { progress: 98 })
                    });
                    thumbnailIntentId = thumbnailIntent.intentId;
                    thumbnailStorageKey = thumbnailIntent.storageKey;
                  }
                }
              } catch {
                thumbnailIntentId = undefined;
                thumbnailStorageKey = undefined;
              }

              const completeResponse = await fetch("/api/media/complete-upload", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  intentId: intent.intentId,
                  storageKey: intent.storageKey,
                  thumbnailIntentId,
                  thumbnailStorageKey,
                  fileName: uploadFile.name,
                  mimeType: uploadFile.type,
                  sizeBytes: uploadFile.size,
                  visibility: settings.visibility,
                  commentsEnabled: settings.commentsEnabled,
                  source: "GALLERY",
                  tags: []
                })
              });
              const complete = await readJsonResponse<{ error?: string; asset?: { id: string } }>(completeResponse);

              if (!completeResponse.ok) {
                throw new Error(complete?.error ?? "Could not save photo record.");
              }

              if (!complete?.asset?.id) {
                throw new Error("Photo uploaded, but the gallery record was not returned.");
              }

              uploaded += 1;
              updateItem(item.id, { assetId: complete.asset.id, status: "done", progress: 100 });
            } catch (caught) {
              failed += 1;
              updateItem(item.id, {
                status: "error",
                error: caught instanceof Error ? caught.message : "Upload failed."
              });
            }
          }

          batchItems = itemsRef.current.filter((candidate) => candidate.status === "queued");
        }

        uploadInProgressRef.current = false;
        setIsUploading(false);

        if (uploaded > 0 || failed > 0) {
          await createUploadNotification({ uploaded, failed });
          setNotice({
            id: crypto.randomUUID(),
            title: failed > 0 ? "Upload finished with errors" : "Uploads complete",
            body:
              failed > 0
                ? `${uploaded} uploaded, ${failed} failed.`
                : `${uploaded} photo${uploaded === 1 ? "" : "s"} uploaded to your gallery.`,
            href: "/profile/gallery"
          });
        }
      })();
    },
    [updateItem]
  );

  const addFilesAndUpload = useCallback(
    (files: FileList | File[], settings: GalleryAccessSettings) => {
      const next = createQueuedUploadItems(files);

      if (next.length === 0) return;

      setItems((current) => {
        const updated = [...current, ...next];
        itemsRef.current = updated;
        return updated;
      });

      window.setTimeout(() => uploadAll(settings), 0);
    },
    [uploadAll]
  );

  const value = useMemo(
    () => ({
      items,
      isUploading,
      notice,
      addFiles,
      addFilesAndUpload,
      clearFinished,
      dismissNotice,
      uploadAll
    }),
    [addFiles, addFilesAndUpload, clearFinished, dismissNotice, isUploading, items, notice, uploadAll]
  );

  return (
    <BackgroundGalleryUploadContext.Provider value={value}>
      {children}
      {isUploading ? (
        <div className="background-upload-status" role="status">
          Uploading gallery photos...
        </div>
      ) : null}
      {notice ? (
        <div className="background-upload-toast" role="status">
          <div>
            <p className="font-semibold text-[var(--gold)]">{notice.title}</p>
            <p className="text-sm text-[var(--muted)]">{notice.body}</p>
          </div>
          <a className="btn-secondary px-3 py-2 text-sm" href={notice.href ?? "/profile/gallery"}>
            View
          </a>
          <button className="btn-secondary px-3 py-2 text-sm" onClick={dismissNotice} type="button">
            Close
          </button>
        </div>
      ) : null}
    </BackgroundGalleryUploadContext.Provider>
  );
}

export function useBackgroundGalleryUploads() {
  const context = useContext(BackgroundGalleryUploadContext);

  if (!context) {
    throw new Error("useBackgroundGalleryUploads must be used inside BackgroundGalleryUploadProvider.");
  }

  return context;
}
