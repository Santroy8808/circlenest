import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { secureAreaLockedResponse } from "@/lib/security/secure-area-guards";

type AlbumVisibility = "PUBLIC" | "FRIENDS" | "FAMILY" | "FRIENDS_FAMILY" | "GROUPS" | "PRIVATE";

function normalizeVisibility(raw: unknown): AlbumVisibility {
  if (raw === "FRIENDS") return "FRIENDS";
  if (raw === "FAMILY") return "FAMILY";
  if (raw === "FRIENDS_FAMILY") return "FRIENDS_FAMILY";
  if (raw === "GROUPS") return "GROUPS";
  if (raw === "PRIVATE") return "PRIVATE";
  return "PUBLIC";
}

function normalizeTagNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .map((value) => String(value).trim())
        .filter(Boolean)
        .slice(0, 30),
    ),
  );
}

function normalizeGroupIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .map((value) => String(value).trim())
        .filter(Boolean)
        .slice(0, 50),
    ),
  );
}

async function resolveTagIds(userId: string, tagNames: string[]): Promise<string[]> {
  if (!tagNames.length) return [];

  await Promise.all(
    tagNames.map((name) =>
      prisma.userMediaTag.upsert({
        where: { userId_name: { userId, name } },
        update: {},
        create: { userId, name },
        select: { id: true },
      }),
    ),
  );

  const tags = await prisma.userMediaTag.findMany({
    where: { userId, name: { in: tagNames } },
    select: { id: true },
  });
  return tags.map((tag) => tag.id);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const locked = secureAreaLockedResponse(session.user.id);
  if (locked) return locked;

  const albums = await prisma.photoAlbum.findMany({
    where: { userId: session.user.id },
    include: {
      albumTags: { include: { tag: true } },
      photos: {
        select: { id: true, url: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(albums);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const locked = secureAreaLockedResponse(session.user.id);
  if (locked) return locked;

  const body = (await request.json()) as {
    title?: string;
    visibility?: AlbumVisibility;
    shareGroupIds?: string[];
    tagNames?: string[];
    parentAlbumId?: string | null;
  };

  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "Album title required" }, { status: 400 });

  const visibility = normalizeVisibility(body.visibility);
  const shareGroupIds = normalizeGroupIds(body.shareGroupIds);
  if (visibility === "GROUPS" && shareGroupIds.length === 0) {
    return NextResponse.json({ error: "Pick at least one group for Groups visibility." }, { status: 400 });
  }

  let parentAlbumId: string | null = null;
  const rawParentAlbumId = String(body.parentAlbumId ?? "").trim();
  if (rawParentAlbumId) {
    const parentAlbum = await prisma.photoAlbum.findFirst({
      where: { id: rawParentAlbumId, userId: session.user.id },
      select: { id: true },
    });
    if (!parentAlbum) return NextResponse.json({ error: "Parent album not found" }, { status: 404 });
    parentAlbumId = parentAlbum.id;
  }

  const album = await prisma.photoAlbum.create({
    data: {
      userId: session.user.id,
      parentAlbumId,
      title,
      visibility,
      shareGroupIds: shareGroupIds.length ? JSON.stringify(shareGroupIds) : null,
    },
  });

  const tagIds = await resolveTagIds(session.user.id, normalizeTagNames(body.tagNames));
  if (tagIds.length) {
    await prisma.photoAlbumTag.createMany({
      data: tagIds.map((tagId) => ({ albumId: album.id, tagId })),
    });
  }

  const hydrated = await prisma.photoAlbum.findUnique({
    where: { id: album.id },
    include: { albumTags: { include: { tag: true } }, photos: true },
  });
  return NextResponse.json(hydrated);
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const locked = secureAreaLockedResponse(session.user.id);
  if (locked) return locked;

  const body = (await request.json()) as {
    albumId?: string;
    title?: string;
    visibility?: AlbumVisibility;
    shareGroupIds?: string[];
    tagNames?: string[];
    parentAlbumId?: string | null;
  };

  const albumId = String(body.albumId ?? "").trim();
  if (!albumId) return NextResponse.json({ error: "Album id required" }, { status: 400 });

  const album = await prisma.photoAlbum.findFirst({
    where: { id: albumId, userId: session.user.id },
    select: { id: true },
  });
  if (!album) return NextResponse.json({ error: "Album not found" }, { status: 404 });

  const visibility = body.visibility ? normalizeVisibility(body.visibility) : undefined;
  const shareGroupIds = body.shareGroupIds ? normalizeGroupIds(body.shareGroupIds) : undefined;
  if (visibility === "GROUPS" && (shareGroupIds?.length ?? 0) === 0) {
    return NextResponse.json({ error: "Pick at least one group for Groups visibility." }, { status: 400 });
  }

  let parentAlbumId: string | null | undefined = undefined;
  if (body.parentAlbumId !== undefined) {
    const rawParentAlbumId = String(body.parentAlbumId ?? "").trim();
    if (!rawParentAlbumId) {
      parentAlbumId = null;
    } else {
      const parentAlbum = await prisma.photoAlbum.findFirst({
        where: { id: rawParentAlbumId, userId: session.user.id },
        select: { id: true },
      });
      if (!parentAlbum) return NextResponse.json({ error: "Parent album not found" }, { status: 404 });
      parentAlbumId = parentAlbum.id;
    }
  }

  await prisma.photoAlbum.update({
    where: { id: album.id },
    data: {
      title: body.title !== undefined ? String(body.title).trim() || undefined : undefined,
      visibility,
      parentAlbumId,
      shareGroupIds:
        shareGroupIds !== undefined
          ? shareGroupIds.length
            ? JSON.stringify(shareGroupIds)
            : null
          : undefined,
    },
  });

  if (body.tagNames !== undefined) {
    const tagIds = await resolveTagIds(session.user.id, normalizeTagNames(body.tagNames));
    await prisma.photoAlbumTag.deleteMany({ where: { albumId: album.id } });
    if (tagIds.length) {
      await prisma.photoAlbumTag.createMany({
        data: tagIds.map((tagId) => ({ albumId: album.id, tagId })),
      });
    }
  }

  const hydrated = await prisma.photoAlbum.findUnique({
    where: { id: album.id },
    include: { albumTags: { include: { tag: true } }, photos: true },
  });
  return NextResponse.json(hydrated);
}
