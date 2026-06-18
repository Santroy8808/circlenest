import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GalleryUploadClient } from "@/components/gallery/gallery-upload-client";
import { AppShell } from "@/components/platform/app-shell";

export default async function UploadPhotosPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/profile/gallery/upload");
  }

  return (
    <AppShell>
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">My Pics</p>
        <h1 className="mt-3 text-3xl font-semibold">Upload photos</h1>
        <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
          Pick photos here, upload them directly to R2, then save the media record to Theta-Space.
        </p>
      </section>
      <div className="mt-5">
        <GalleryUploadClient />
      </div>
    </AppShell>
  );
}
