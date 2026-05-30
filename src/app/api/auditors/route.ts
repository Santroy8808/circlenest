import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const classLevel = (searchParams.get("classLevel") ?? "").trim();
  const location = (searchParams.get("location") ?? "").trim();
  const country = (searchParams.get("country") ?? "").trim();
  const state = (searchParams.get("state") ?? "").trim();
  const city = (searchParams.get("city") ?? "").trim();
  const lookingForPcs = (searchParams.get("lookingForPcs") ?? "").trim() === "1";

  const listings = await prisma.auditorListing.findMany({
    where: {
      ...(lookingForPcs ? { lookingForPcs: true } : {}),
      ...(classLevel ? { classLevel: { contains: classLevel, mode: "insensitive" } } : {}),
      ...(location ? { location: { contains: location, mode: "insensitive" } } : {}),
      ...(country ? { country: { contains: country, mode: "insensitive" } } : {}),
      ...(state ? { state: { contains: state, mode: "insensitive" } } : {}),
      ...(city ? { city: { contains: city, mode: "insensitive" } } : {}),
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
    country?: string;
    state?: string;
    city?: string;
    travels?: boolean;
    lookingForPcs?: boolean;
    trainedAt?: string;
    credentials?: string;
    specialtyCourses?: string;
    bio?: string;
    services?: string;
    successStories?: string;
    successStoriesJson?: string;
    textStream?: string;
    proEnabled?: boolean;
    media?: Array<{ url: string; caption?: string }>;
  };
  const displayName = String(body.displayName ?? "").trim();
  const classLevel = String(body.classLevel ?? "").trim();
  if (!displayName || !classLevel) return NextResponse.json({ error: "displayName and classLevel are required" }, { status: 400 });

  const media = Array.isArray(body.media) ? body.media.slice(0, 20).filter((item) => item?.url) : [];
  const payload = {
    displayName,
    classLevel,
    location: String(body.location ?? "").trim() || null,
    country: String(body.country ?? "").trim() || null,
    state: String(body.state ?? "").trim() || null,
    city: String(body.city ?? "").trim() || null,
    travels: Boolean(body.travels),
    lookingForPcs: Boolean(body.lookingForPcs),
    trainedAt: String(body.trainedAt ?? "").trim() || null,
    credentials: String(body.credentials ?? "").trim() || null,
    specialtyCourses: String(body.specialtyCourses ?? "").trim() || null,
    bio: String(body.bio ?? "").trim() || null,
    services: String(body.services ?? "").trim() || null,
    successStories: String(body.successStories ?? "").trim() || null,
    successStoriesJson: String(body.successStoriesJson ?? "").trim() || null,
    textStream: String(body.textStream ?? "").trim() || null,
    proEnabled: Boolean(body.proEnabled),
  };

  const created = await prisma.auditorListing.upsert({
    where: { userId: session.user.id },
    update: {
      ...payload,
      media: {
        deleteMany: {},
        create: media.map((item) => ({ url: item.url, caption: item.caption ? String(item.caption).trim() : null })),
      },
    },
    create: {
      userId: session.user.id,
      ...payload,
      media: { create: media.map((item) => ({ url: item.url, caption: item.caption ? String(item.caption).trim() : null })) },
    },
    include: { user: { select: { id: true, username: true } }, media: true },
  });

  return NextResponse.json(created);
}
