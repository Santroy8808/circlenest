import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { GalleryManagerClient } from "@/components/profile/gallery-manager-client";
import { getStorageLimitBytes, resolveUserAccessPolicy } from "@/lib/policy/tier-policy";

const PERSONAL_GALLERY_EXCLUDED_ALBUMS = ["stream_photos"];

export default async function GalleryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [albums, profile, tags, usage, user] = await Promise.all([
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
                author: { select: { username: true, fullName: true } },
              },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.profile.findUnique({
      where: { userId: session.user.id },
      select: { avatarUrl: true, bannerUrl: true },
    }),
    prisma.userMediaTag.findMany({
      where: { userId: session.user.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.userUploadAsset.aggregate({
      where: { userId: session.user.id },
      _sum: { sizeBytes: true },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, subscriptionTier: true },
    }),
  ]);
  const storageLimitBytes = getStorageLimitBytes(resolveUserAccessPolicy(user));

  return (
    <AppShell>
      <GalleryManagerClient
        initialAlbums={albums}
        initialAvatarUrl={profile?.avatarUrl ?? null}
        initialBannerUrl={profile?.bannerUrl ?? null}
        initialUserTags={tags.map((tag) => tag.name)}
        initialUsageBytes={usage._sum.sizeBytes ?? 0}
        initialLimitBytes={storageLimitBytes}
      />
    </AppShell>
  );
}
