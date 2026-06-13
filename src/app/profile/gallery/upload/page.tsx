import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { GalleryUploadSurfaceClient } from "@/components/profile/gallery-upload-surface-client";

const PERSONAL_GALLERY_EXCLUDED_ALBUMS = ["stream_photos"];

export default async function GalleryUploadPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const albums = await prisma.photoAlbum.findMany({
    where: {
      userId: session.user.id,
      title: { notIn: PERSONAL_GALLERY_EXCLUDED_ALBUMS },
    },
    select: {
      id: true,
      title: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AppShell>
      <GalleryUploadSurfaceClient
        mode="page"
        autoOpenPicker
        albums={albums}
        defaultAlbumId={albums[0]?.id}
      />
    </AppShell>
  );
}
