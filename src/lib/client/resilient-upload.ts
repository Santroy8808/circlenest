"use client";

function directUploadWithProgress(url: string, file: File, onProgress: (progress: number) => void) {
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
        reject(new Error(`Direct storage upload failed with ${request.status}.`));
      }
    };
    request.onerror = () => reject(new Error("Direct storage upload failed."));
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.send(file);
  });
}

async function proxyUploadWithProgress(input: {
  storageKey: string;
  file: File;
  onProgress: (progress: number) => void;
  proxyUrl?: string;
  fields?: Record<string, string>;
}) {
  const formData = new FormData();
  formData.set("storageKey", input.storageKey);
  formData.set("file", input.file);

  for (const [key, value] of Object.entries(input.fields ?? {})) {
    formData.set(key, value);
  }

  input.onProgress(45);
  const response = await fetch(input.proxyUrl ?? "/api/media/proxy-upload", {
    method: "POST",
    body: formData
  });
  input.onProgress(95);
  const payload = (await response.json().catch(() => ({}))) as { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Upload could not reach storage. Check connection and try again.");
  }
}

export async function uploadWithResilientFallback(input: {
  uploadUrl: string;
  storageKey: string;
  file: File;
  onProgress: (progress: number) => void;
  proxyUrl?: string;
  fields?: Record<string, string>;
}) {
  try {
    await directUploadWithProgress(input.uploadUrl, input.file, input.onProgress);
  } catch {
    await proxyUploadWithProgress(input);
  }
}
