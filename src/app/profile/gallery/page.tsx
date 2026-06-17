import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { GalleryManagerClient } from "@/components/profile/gallery-manager-client";
import { parseDateTagQuery } from "@/lib/gallery/system-tags";

const PERSONAL_GALLERY_EXCLUDED_ALBUMS = ["stream_photos"];
const RECENT_GALLERY_TAKE = 48;

function readSingleParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function parseDateFloor(raw: string) {
  if (!raw) return null;
  const value = new Date(`${raw}T00:00:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function parseDateCeil(raw: string) {
  if (!raw) return null;
  const value = new Date(`${raw}T23:59:59.999`);
  return Number.isNaN(value.getTime()) ? null : value;
}

export default async function GalleryPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const search = readSingleParam(searchParams?.q).trim();
  const from = readSingleParam(searchParams?.from).trim();
  const to = readSingleParam(searchParams?.to).trim();
  const albumId = readSingleParam(searchParams?.album).trim();
  const scope = readSingleParam(searchParams?.scope) === "all" ? "all" : "recent";

  const fromDate = parseDateFloor(from);
  const toDate = parseDateCeil(to);
  const searchDate = search ? parseDateTagQuery(search) : null;

  const createdAtFilter: { gte?: Date; lte?: Date } = {};
  if (fromDate) createdAtFilter.gte = fromDate;
  if (toDate) createdAtFilter.lte = toDate;
  if (!fromDate && !toDate && searchDate) {
    createdAtFilter.gte = searchDate.start;
    createdAtFilter.lte = searchDate.end;
  }

  const photoWhere = {
    album: {
      userId: session.user.id,
      title: { notIn: PERSONAL_GALLERY_EXCLUDED_ALBUMS },
      ...(albumId ? { id: albumId } : {}),
    },
    visibility: { not: "GROUPS" as const },
    ...(createdAtFilter.gte || createdAtFilter.lte ? { createdAt: createdAtFilter } : {}),
    ...(
      search && !searchDate
        ? {
            OR: [
              { caption: { contains: search } },
              { tags: { contains: search } },
              { album: { title: { contains: search } } },
              { photoTags: { some: { tag: { name: { contains: search } } } } },
            ],
          }
        : {}
    ),
  };

  const [albums, tags, profile, loadedPhotos] = await Promise.all([
    prisma.photoAlbum.findMany({
      where: {
        userId: session.user.id,
        title: { notIn: PERSONAL_GALLERY_EXCLUDED_ALBUMS },
      },
      include: {
        albumTags: { include: { tag: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.userMediaTag.findMany({
      where: { userId: session.user.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.profile.findUnique({
      where: { userId: session.user.id },
      select: { avatarUrl: true, bannerUrl: true },
    }),
    prisma.photo.findMany({
      where: photoWhere,
      include: {
        album: { select: { id: true, title: true } },
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
      take: scope === "recent" ? RECENT_GALLERY_TAKE + 1 : undefined,
    }),
  ]);

  const hasMoreHistory = scope === "recent" && loadedPhotos.length > RECENT_GALLERY_TAKE;
  const initialPhotos = hasMoreHistory ? loadedPhotos.slice(0, RECENT_GALLERY_TAKE) : loadedPhotos;

  return (
    <AppShell>
      <GalleryManagerClient
        initialAlbums={albums}
        initialPhotos={initialPhotos}
        initialUserTags={tags.map((tag) => tag.name)}
        initialAvatarUrl={profile?.avatarUrl ?? null}
        initialBannerUrl={profile?.bannerUrl ?? null}
        initialQuery={{ search, from, to, albumId, scope }}
        hasMoreHistory={hasMoreHistory}
      />
    </AppShell>
  );
}
