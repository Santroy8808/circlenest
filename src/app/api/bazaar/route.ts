import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const location = (searchParams.get("location") ?? "").trim();
  const minPrice = Number(searchParams.get("minPrice") ?? "");
  const maxPrice = Number(searchParams.get("maxPrice") ?? "");

  const listings = await prisma.bazaarListing.findMany({
    where: {
      status: "ACTIVE",
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { category: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(location ? { location: { contains: location, mode: "insensitive" } } : {}),
      ...(!Number.isNaN(minPrice) ? { price: { gte: minPrice } } : {}),
      ...(!Number.isNaN(maxPrice) ? { price: { lte: maxPrice } } : {}),
    },
    include: { seller: { select: { id: true, username: true } } },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
  });

  return NextResponse.json(listings);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    title?: string;
    description?: string;
    price?: number | string;
    location?: string;
    category?: string;
  };

  const title = String(body.title ?? "").trim();
  const price = Number(body.price);
  if (!title || Number.isNaN(price) || price < 0) return NextResponse.json({ error: "Valid title and price are required" }, { status: 400 });

  const listing = await prisma.bazaarListing.create({
    data: {
      sellerId: session.user.id,
      title,
      description: String(body.description ?? "").trim() || null,
      price,
      location: String(body.location ?? "").trim() || null,
      category: String(body.category ?? "").trim() || null,
    },
    include: { seller: { select: { id: true, username: true } } },
  });
  return NextResponse.json(listing);
}
