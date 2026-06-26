import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GalleryGrid } from "@/components/gallery/gallery-grid";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { safeListMyPics } from "@/modules/gallery-media-storage/gallery-media-storage.service";

export default async function MyPicsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/profile/gallery");
  }

  const activeActor = await getActiveAccountActor(session.user.id);
  const assets = await safeListMyPics(activeActor.actorUserId, 180, { includeSystem: true });

  return (
    <AppShell>
      <GalleryGrid assets={assets} />
    </AppShell>
  );
}
