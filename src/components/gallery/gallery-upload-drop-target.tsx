"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";

const galleryImageMimeTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export function galleryImageFiles(files: FileList | File[]) {
  return Array.from(files).filter((file) => galleryImageMimeTypes.has(file.type));
}

function hasFiles(event: DragEvent<HTMLDivElement>) {
  return Array.from(event.dataTransfer.types).includes("Files");
}

export function GalleryUploadDropTarget({
  children,
  className = "",
  onFiles,
  prompt = "Drop photos to upload"
}: {
  children: ReactNode;
  className?: string;
  onFiles: (files: File[]) => void;
  prompt?: string;
}) {
  const dragDepthRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (dragDepthRef.current === 0) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);

    const imageFiles = galleryImageFiles(event.dataTransfer.files);
    if (imageFiles.length > 0) onFiles(imageFiles);
  }

  return (
    <div
      className={`gallery-upload-drop-target${isDragging ? " is-dragging" : ""}${className ? ` ${className}` : ""}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={(event) => {
        if (hasFiles(event)) event.preventDefault();
      }}
      onDrop={handleDrop}
    >
      {children}
      {isDragging ? <div className="gallery-upload-drop-overlay" role="status">{prompt}</div> : null}
    </div>
  );
}
