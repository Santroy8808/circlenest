"use client";

import { useEffect, useMemo, useState } from "react";
import type { GalleryAssetView } from "@/modules/gallery-media-storage/types";

function formatBytes(sizeBytes: string) {
  const bytes = Number(sizeBytes);

  if (!Number.isFinite(bytes) || bytes <= 0) return "Unknown";

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function visibilityLabel(value: GalleryAssetView["visibility"]) {
  if (value === "PUBLIC") return "Public";
  if (value === "MEMBERS") return "Members";
  return "Private";
}

export function GalleryAssetInfo({ asset, imageUrl }: { asset: GalleryAssetView; imageUrl: string }) {
  const initialDimensions = useMemo(
    () => (asset.width && asset.height ? { width: asset.width, height: asset.height } : null),
    [asset.height, asset.width]
  );
  const [detectedDimensions, setDetectedDimensions] = useState(initialDimensions);
  const resolution = useMemo(() => {
    const dimensions = detectedDimensions ?? initialDimensions;
    return dimensions ? `${dimensions.width} x ${dimensions.height} px` : "Not available";
  }, [detectedDimensions, initialDimensions]);

  useEffect(() => {
    if (initialDimensions) return;

    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth && image.naturalHeight) {
        setDetectedDimensions({ width: image.naturalWidth, height: image.naturalHeight });
      }
    };
    image.src = imageUrl;

    return () => {
      image.onload = null;
    };
  }, [imageUrl, initialDimensions]);

  return (
    <section className="surface rounded-md p-5">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Photo info</p>
      <dl className="gallery-photo-info-list mt-4">
        <div>
          <dt>File name</dt>
          <dd>{asset.originalName ?? "Unknown"}</dd>
        </div>
        <div>
          <dt>Uploaded</dt>
          <dd>{new Date(asset.createdAt).toLocaleDateString()}</dd>
        </div>
        <div>
          <dt>File type</dt>
          <dd>{asset.mimeType}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{formatBytes(asset.sizeBytes)}</dd>
        </div>
        <div>
          <dt>Resolution</dt>
          <dd>{resolution}</dd>
        </div>
        <div>
          <dt>Visibility</dt>
          <dd>{visibilityLabel(asset.visibility)}</dd>
        </div>
        <div>
          <dt>Tags and albums</dt>
          <dd>{asset.collections.length ? asset.collections.map((item) => item.name).join(", ") : "None yet"}</dd>
        </div>
      </dl>
    </section>
  );
}
