"use client";

class DirectUploadError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(status > 0 ? `Direct storage upload failed with ${status}.` : "Direct storage upload failed.");
    this.name = "DirectUploadError";
    this.status = status;
  }
}

function directUploadWithProgress(
  url: string,
  file: File,
  uploadHeaders: Record<string, string>,
  onProgress: (progress: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.max(1, Math.round((event.loaded / event.total) * 100)));
      }
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
      } else {
        reject(new DirectUploadError(request.status));
      }
    };
    request.onerror = () => reject(new DirectUploadError(0));
    request.onabort = () => reject(new DirectUploadError(0));
    request.open("PUT", url);

    const hasContentType = Object.keys(uploadHeaders).some((header) => header.toLowerCase() === "content-type");
    if (!hasContentType) {
      request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    }
    for (const [header, value] of Object.entries(uploadHeaders)) {
      request.setRequestHeader(header, value);
    }

    request.send(file);
  });
}

export async function uploadWithResilientFallback(input: {
  uploadUrl: string;
  storageKey: string;
  uploadHeaders?: Record<string, string>;
  file: File;
  onProgress: (progress: number) => void;
  proxyFallback?: {
    url: string;
    access: "public" | "private";
  };
}) {
  async function uploadThroughProxy(error: unknown) {
    if (!input.proxyFallback || !(error instanceof DirectUploadError)) throw error;

    input.onProgress(1);
    const formData = new FormData();
    formData.set("storageKey", input.storageKey);
    formData.set("access", input.proxyFallback.access);
    formData.set("file", input.file);

    const response = await fetch(input.proxyFallback.url, {
      method: "POST",
      body: formData
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      throw new Error(payload?.error ?? "Server upload fallback failed.");
    }

    input.onProgress(100);
  }

  try {
    await directUploadWithProgress(input.uploadUrl, input.file, input.uploadHeaders ?? {}, input.onProgress);
  } catch (error) {
    if (!(error instanceof DirectUploadError)) throw error;

    if (error.status === 0 || (error.status >= 500 && error.status < 600)) {
      try {
        input.onProgress(1);
        await new Promise((resolve) => window.setTimeout(resolve, 300));
        await directUploadWithProgress(input.uploadUrl, input.file, input.uploadHeaders ?? {}, input.onProgress);
        return;
      } catch (retryError) {
        await uploadThroughProxy(retryError);
        return;
      }
    }

    await uploadThroughProxy(error);
  }
}
