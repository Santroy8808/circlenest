"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

type InAppImageViewerProps = {
  alt?: string | null;
  children: ReactNode;
  className?: string;
  imageClassName?: string;
  src: string;
  tooltip?: string;
};

export function InAppImageViewer({
  alt,
  children,
  className,
  imageClassName,
  src,
  tooltip = "Open image."
}: InAppImageViewerProps) {
  const [open, setOpen] = useState(false);
  const imageAlt = alt || "Image";

  useEffect(() => {
    if (!open) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <>
      <button
        className={["in-app-image-trigger", className].filter(Boolean).join(" ")}
        data-tooltip={tooltip}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        type="button"
      >
        {children}
      </button>
      {open ? (
        <div className="in-app-image-viewer" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label={imageAlt}>
          <div className="in-app-image-viewer-panel" onClick={(event) => event.stopPropagation()}>
            <button className="in-app-image-viewer-close" data-tooltip="Close image viewer." onClick={() => setOpen(false)} type="button">
              Close
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={imageAlt} className={imageClassName} src={src} />
            {alt ? <p className="in-app-image-viewer-caption">{alt}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
