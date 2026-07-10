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
}) {
  try {
    await directUploadWithProgress(input.uploadUrl, input.file, input.uploadHeaders ?? {}, input.onProgress);
  } catch (error) {
    if (!(error instanceof DirectUploadError) || (error.status > 0 && error.status < 500)) throw error;

    input.onProgress(1);
    await new Promise((resolve) => window.setTimeout(resolve, 300));
    await directUploadWithProgress(input.uploadUrl, input.file, input.uploadHeaders ?? {}, input.onProgress);
  }
}
