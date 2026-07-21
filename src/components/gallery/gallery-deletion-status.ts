export type GalleryDeletionStatus = "queued" | "completed";

export function galleryDeletionStatusMessage(status: GalleryDeletionStatus, count: number) {
  const photos = `${count} photo${count === 1 ? "" : "s"}`;
  return status === "completed"
    ? `Deletion completed for ${photos}.`
    : `Deletion queued for ${photos}. ${count === 1 ? "It is" : "They are"} hidden while secure storage removal is verified.`;
}
