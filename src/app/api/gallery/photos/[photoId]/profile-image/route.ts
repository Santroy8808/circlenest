import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

type ProfileImageBody = {
  type?: "avatar" | "banner";
};

export async function POST(request: Request, context: { params: { photoId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as ProfileImageBody | null;
  const type = body?.type;
  if (type !== "avatar" && type !== "banner") {
    return NextResponse.json({ error: "Invalid profile image type." }, { status: 400 });
  }

  const photo = await prisma.photo.findFirst({
    where: { id: context.params.photoId, album: { userId: session.user.id } },
    select: { url: true },
  });
  if (!photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 });

  const profile = await prisma.profile.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      displayName: "",
      avatarUrl: type === "avatar" ? photo.url : null,
      bannerUrl: type === "banner" ? photo.url : null,
    },
    update: type === "avatar" ? { avatarUrl: photo.url } : { bannerUrl: photo.url },
  });

  return NextResponse.json({ ok: true, profile });
}
