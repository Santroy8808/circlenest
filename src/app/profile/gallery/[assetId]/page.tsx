import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { GalleryAssetInfo } from "@/components/gallery/gallery-asset-info";
import { GalleryAssetActions } from "@/components/gallery/gallery-asset-actions";
import { GalleryAssetEngagement, GalleryAssetVisibilityControls } from "@/components/gallery/gallery-asset-engagement";
import { GalleryAssetTags } from "@/components/gallery/gallery-asset-tags";
import { GalleryProfileBanner } from "@/components/gallery/gallery-profile-banner";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { prisma } from "@/lib/platform/db";
import { timeServerStep } from "@/lib/platform/server-timing";
import { getMyPicViewer } from "@/modules/gallery-media-storage/gallery-media-storage.service";

export default async function GalleryAssetPage({ params }: { params: { assetId: string } }) {
  const session = await timeServerStep("gallery-detail.auth", auth());

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/profile/gallery/${params.assetId}`);
  }

  const activeActor = await timeServerStep("gallery-detail.actor", getActiveAccountActor(session.user.id));
  const [viewer, currentActorProfile] = await Promise.all([
    timeServerStep("gallery-detail.media-viewer", getMyPicViewer(activeActor.actorUserId, params.assetId)),
    prisma.user.findUnique({
      where: { id: activeActor.actorUserId },
      include: { profile: true }
    })
  ]);

  if (!viewer) {
    notFound();
  }

  const { asset, comments, next, previous } = viewer;
  const imageUrl = asset.publicUrl ?? `/api/media/assets/${asset.id}`;

  return (
    <AppShell>
      <GalleryProfileBanner
        action={
          <Link className="btn-secondary" href="/profile/gallery">
            Back to gallery
          </Link>
        }
        bannerUrl={currentActorProfile?.profile?.bannerUrl}
        subtitle="Photo viewer"
      />

      <div className="gallery-detail-layout mt-5">
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
          <img alt={asset.originalName ?? "Gallery photo"} className="gallery-detail-image rounded-md" src={imageUrl} />
        </section>

        <aside className="gallery-detail-sidebar grid content-start gap-5">
          <details className="gallery-photo-options surface rounded-md">
            <summary className="gallery-photo-options-summary">
              <span>
                <span className="gallery-photo-options-kicker">Info & controls</span>
                <span className="gallery-photo-options-label">Photo details, tags, visibility, avatar/banner, delete</span>
              </span>
              <span aria-hidden="true" className="gallery-photo-options-dots">
                ...
              </span>
            </summary>
            <div className="gallery-photo-options-content">
              <GalleryAssetInfo asset={asset} imageUrl={imageUrl} />
              <GalleryAssetActions mediaAssetId={asset.id} />
              <GalleryAssetTags asset={asset} />
              <GalleryAssetVisibilityControls asset={asset} />
            </div>
          </details>
          <GalleryAssetEngagement
            asset={asset}
            currentUser={{
              id: activeActor.actorUserId,
              displayName: currentActorProfile?.profile?.displayName ?? currentActorProfile?.username ?? "You",
              username: currentActorProfile?.username ?? "you",
              avatarUrl: currentActorProfile?.profile?.avatarUrl
            }}
            initialComments={comments}
          />
        </aside>
      </div>
    </AppShell>
  );
}
