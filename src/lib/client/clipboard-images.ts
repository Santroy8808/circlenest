const supportedClipboardImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

type ClipboardFileItem = {
  getAsFile: () => File | null;
  kind: string;
  type: string;
};

type ClipboardImageData = {
  files?: Iterable<File>;
  items?: Iterable<ClipboardFileItem>;
};

export function isSupportedClipboardImage(file: Pick<File, "type">) {
  return supportedClipboardImageTypes.has(file.type.trim().toLowerCase());
}

export function getClipboardImageFile(clipboardData: ClipboardImageData | null | undefined) {
  if (!clipboardData) return null;

  for (const file of clipboardData.files ?? []) {
    if (isSupportedClipboardImage(file)) return file;
  }

  for (const item of clipboardData.items ?? []) {
    if (item.kind !== "file" || !supportedClipboardImageTypes.has(item.type.trim().toLowerCase())) continue;
    const file = item.getAsFile();
    if (file && isSupportedClipboardImage(file)) return file;
  }

  return null;
}
