import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const classLevel = (searchParams.get("classLevel") ?? "").trim();
  const location = (searchParams.get("location") ?? "").trim();

  const listings = await prisma.auditorListing.findMany({
    where: {
      ...(classLevel ? { classLevel: { contains: classLevel, mode: "insensitive" } } : {}),
      ...(location ? { location: { contains: location, mode: "insensitive" } } : {}),
    },
    include: { user: { select: { id: true, username: true } }, media: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(listings);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as {
    displayName?: string;
    classLevel?: string;
    location?: string;
    travels?: boolean;
    services?: string;
    successStories?: string;
    textStream?: string;
    proEnabled?: boolean;
    media?: Array<{ url: string; caption?: string }>;
  };
  const displayName = String(body.displayName ?? "").trim();
  const classLevel = String(body.classLevel ?? "").trim();
  if (!displayName || !classLevel) return NextResponse.json({ error: "displayName and classLevel are required" }, { status: 400 });

  const media = Array.isArray(body.media) ? body.media.slice(0, 10).filter((item) => item?.url) : [];
  const created = await prisma.auditorListing.create({
    data: {
      userId: session.user.id,
      displayName,
      classLevel,
      location: String(body.location ?? "").trim() || null,
      travels: Boolean(body.travels),
      services: String(body.services ?? "").trim() || null,
      successStories: String(body.successStories ?? "").trim() || null,
      textStream: String(body.textStream ?? "").trim() || null,
      proEnabled: Boolean(body.proEnabled),
      media: { create: media.map((item) => ({ url: item.url, caption: item.caption ? String(item.caption).trim() : null })) },
    },
    include: { user: { select: { id: true, username: true } }, media: true },
  });

  return NextResponse.json(created);
}

