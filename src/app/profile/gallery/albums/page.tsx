import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { GalleryAlbumsManagerClient } from "@/components/profile/gallery-albums-manager-client";

const PERSONAL_GALLERY_EXCLUDED_ALBUMS = ["stream_photos"];

export default async function GalleryAlbumsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [albums, tags] = await Promise.all([
    prisma.photoAlbum.findMany({
      where: {
        userId: session.user.id,
        title: { notIn: PERSONAL_GALLERY_EXCLUDED_ALBUMS },
      },
      include: {
        albumTags: { include: { tag: true } },
        photos: {
          select: { id: true, url: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.userMediaTag.findMany({
      where: { userId: session.user.id },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
  ]);

  return (
    <AppShell>
      <GalleryAlbumsManagerClient
        initialAlbums={albums}
        initialUserTags={tags.map((tag) => tag.name)}
      />
    </AppShell>
  );
}
