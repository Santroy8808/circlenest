import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { GalleryManagerClient } from "@/components/profile/gallery-manager-client";

const PERSONAL_GALLERY_EXCLUDED_ALBUMS = ["stream_photos"];

export default async function GalleryPage() {
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
          where: { visibility: { not: "GROUPS" } },
          include: {
            photoTags: { include: { tag: true } },
            comments: {
              select: {
                id: true,
                content: true,
                parentCommentId: true,
                createdAt: true,
                author: { select: { username: true, fullName: true, profile: { select: { displayName: true, avatarUrl: true } } } },
              },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.userMediaTag.findMany({
      where: { userId: session.user.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <AppShell>
      <GalleryManagerClient
        initialAlbums={albums}
        initialUserTags={tags.map((tag) => tag.name)}
      />
    </AppShell>
  );
}
