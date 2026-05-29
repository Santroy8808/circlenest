import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const detailedBioJson =
    body.detailedBio && typeof body.detailedBio === "object"
      ? JSON.stringify(body.detailedBio)
      : undefined;
  try {
    if (typeof body.backupEmail === "string") {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { backupEmail: body.backupEmail.trim() || null },
      });
    }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ error: "Backup email is already used by another account." }, { status: 409 });
    }
    throw error;
  }

  const profile = await prisma.profile.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      displayName: body.displayName ?? "",
      headline: body.headline ?? null,
      bio: body.bio ?? null,
      detailedBioJson: detailedBioJson ?? null,
      location: body.location ?? null,
      interests: body.interests ?? null,
      relationshipStatus: body.relationshipStatus ?? null,
      avatarUrl: body.avatarUrl ?? null,
      bannerUrl: body.bannerUrl ?? null,
    },
    update: {
      displayName: body.displayName ?? undefined,
      headline: body.headline ?? undefined,
      bio: body.bio ?? undefined,
      detailedBioJson,
      location: body.location ?? undefined,
      interests: body.interests ?? undefined,
      relationshipStatus: body.relationshipStatus ?? undefined,
      avatarUrl: body.avatarUrl ?? undefined,
      bannerUrl: body.bannerUrl ?? undefined,
    },
  });

  return NextResponse.json(profile);
}
