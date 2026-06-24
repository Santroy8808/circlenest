import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { GalleryAssetActions } from "@/components/gallery/gallery-asset-actions";
import { AppShell } from "@/components/platform/app-shell";
import { getMyPicViewer } from "@/modules/gallery-media-storage/gallery-media-storage.service";

export default async function GalleryAssetPage({ params }: { params: { assetId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/profile/gallery/${params.assetId}`);
  }

  const viewer = await getMyPicViewer(session.user.id, params.assetId);

  if (!viewer) {
    notFound();
  }

  const { asset, next, previous } = viewer;
  const imageUrl = asset.publicUrl ?? `/api/media/assets/${asset.id}`;

  return (
    <AppShell>
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">My Pics</p>
            <h1 className="mt-3 text-3xl font-semibold">{asset.originalName ?? "Photo"}</h1>
            <p className="mt-2 text-[var(--muted)]">{new Date(asset.createdAt).toLocaleDateString()}</p>
          </div>
          <Link className="btn-secondary" href="/profile/gallery">
            Back to gallery
          </Link>
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="surface gallery-viewer rounded-md p-4">
          <div className="gallery-viewer-nav">
            {previous ? (
              <Link className="btn-secondary" href={`/profile/gallery/${previous.id}`} prefetch>
                Previous
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link className="btn-secondary" href={`/profile/gallery/${next.id}`} prefetch>
                Next
              </Link>
            ) : (
              <span />
            )}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={asset.originalName ?? "Gallery photo"} className="max-h-[72vh] w-full rounded-md object-contain" src={imageUrl} />
        </section>

        <div className="grid content-start gap-5">
          <GalleryAssetActions mediaAssetId={asset.id} />
          <section className="surface rounded-md p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Details</p>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-[var(--muted)]">Visibility</dt>
                <dd>{asset.visibility}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">File type</dt>
                <dd>{asset.mimeType}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Tags and albums</dt>
                <dd>{asset.collections.length ? asset.collections.map((item) => item.name).join(", ") : "None yet"}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
