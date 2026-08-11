import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { galleryImageFiles } from "@/components/gallery/gallery-upload-drop-target";

test("gallery drop target keeps only supported image files", () => {
  const files = [
    { name: "photo.jpg", type: "image/jpeg" },
    { name: "notes.pdf", type: "application/pdf" },
    { name: "art.webp", type: "image/webp" }
  ] as File[];

  assert.deepEqual(galleryImageFiles(files).map((file) => file.name), ["photo.jpg", "art.webp"]);
});

test("the gallery page and dashboard widget use the shared drop target", () => {
  const galleryGrid = readFileSync(resolve(process.cwd(), "src/components/gallery/gallery-grid.tsx"), "utf8");
  const dashboard = readFileSync(resolve(process.cwd(), "src/components/dashboard/dashboard-workspace.tsx"), "utf8");

  assert.match(galleryGrid, /<GalleryUploadDropTarget/);
  assert.match(dashboard, /<GalleryUploadDropTarget/);
});
