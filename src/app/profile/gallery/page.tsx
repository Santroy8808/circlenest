import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GalleryGrid } from "@/components/gallery/gallery-grid";
import { GalleryProfileBanner } from "@/components/gallery/gallery-profile-banner";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { prisma } from "@/lib/platform/db";
import { timeServerStep } from "@/lib/platform/server-timing";
import { safeListMyPics } from "@/modules/gallery-media-storage/gallery-media-storage.service";

export default async function MyPicsPage() {
  const session = await timeServerStep("gallery.auth", auth());

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/profile/gallery");
  }

  const activeActor = await timeServerStep("gallery.actor", getActiveAccountActor(session.user.id));
  const [assets, currentActorProfile] = await Promise.all([
    timeServerStep("gallery.media-list", safeListMyPics(activeActor.actorUserId, 180, { includeSystem: true })),
    prisma.user.findUnique({
      where: { id: activeActor.actorUserId },
      include: { profile: true }
    })
  ]);

  return (
    <AppShell>
      <GalleryProfileBanner bannerUrl={currentActorProfile?.profile?.bannerUrl} subtitle="Gallery" />
      <div className="mt-5">
        <GalleryGrid assets={assets} />
      </div>
    </AppShell>
  );
}
