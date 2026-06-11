import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { GalleryManagerClient } from "@/components/profile/gallery-manager-client";
import { SecureAreaSessionClient } from "@/components/security/secure-area-session-client";
import { requireSecureAreaPage } from "@/lib/security/secure-area-guards";
import { getStorageLimitBytes, resolveUserAccessPolicy } from "@/lib/policy/tier-policy";

export default async function GalleryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  requireSecureAreaPage(session.user.id, "/profile/gallery");

  const [albums, profile, tags, joinedGroups, usage, user] = await Promise.all([
    prisma.photoAlbum.findMany({
      where: { userId: session.user.id },
      include: {
        albumTags: { include: { tag: true } },
        photos: {
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
    prisma.groupMember.findMany({
      where: { userId: session.user.id },
      select: {
        groupId: true,
        group: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
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
      <SecureAreaSessionClient />
      <GalleryManagerClient
        initialAlbums={albums}
        initialAvatarUrl={profile?.avatarUrl ?? null}
        initialBannerUrl={profile?.bannerUrl ?? null}
        initialUserTags={tags.map((tag) => tag.name)}
        initialGroups={joinedGroups.map((entry) => ({ id: entry.groupId, name: entry.group.name }))}
        initialUsageBytes={usage._sum.sizeBytes ?? 0}
        initialLimitBytes={storageLimitBytes}
      />
    </AppShell>
  );
}
