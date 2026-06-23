import Link from "next/link";
import type { GalleryAssetView } from "@/modules/gallery-media-storage/types";

export function GalleryGrid({ assets }: { assets: GalleryAssetView[] }) {
  if (assets.length === 0) {
    return (
      <section className="surface rounded-md p-6 text-center">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">No photos yet</h2>
        <p className="mt-2 text-[var(--muted)]">Upload your first photo to start building My Pics.</p>
        <Link className="btn-primary mt-5 inline-block" href="/profile/gallery/upload">
          Upload photos
        </Link>
      </section>
    );
  }

  return (
    <section className="gallery-grid">
      {assets.map((asset) => (
        <Link key={asset.id} className="gallery-tile" href={`/profile/gallery/${asset.id}`}>
          {asset.publicUrl || asset.id ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={asset.originalName ?? "Gallery photo"} src={asset.publicUrl ?? `/api/media/assets/${asset.id}`} />
          ) : (
            <div className="gallery-tile-fallback">No preview</div>
          )}
          <div className="gallery-tile-meta">
            <p className="truncate font-semibold">{asset.originalName ?? "Photo"}</p>
              <p className="text-xs text-[var(--muted)]">{new Date(asset.createdAt).toLocaleDateString()}</p>
          </div>
        </Link>
      ))}
    </section>
  );
}
