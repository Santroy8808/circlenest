import Link from "next/link";
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
      <section className="surface rounded-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">My Pics</p>
            <h1 className="mt-3 text-3xl font-semibold">Photos</h1>
            <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
              Recent photos first. Albums, tags, and system dates organize the pool without turning the page into an
              admin panel.
            </p>
          </div>
          <Link className="btn-primary" href="/profile/gallery/upload">
            Upload
          </Link>
        </div>
      </section>
      <div className="mt-5">
        <GalleryGrid assets={assets} />
      </div>
    </AppShell>
  );
}
