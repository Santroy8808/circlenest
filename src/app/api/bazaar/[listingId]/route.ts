import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export async function PATCH(request: Request, context: { params: { listingId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.bazaarListing.findUnique({ where: { id: context.params.listingId } });
  if (!existing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  if (existing.sellerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as {
    action?: "RENEW";
    title?: string;
    description?: string;
    price?: number | string;
    location?: string;
    category?: string;
    status?: "ACTIVE" | "SOLD" | "ARCHIVED";
  };
  if (body.action === "RENEW") {
    const renewed = await prisma.bazaarListing.update({
      where: { id: existing.id },
      data: {
        status: "ACTIVE",
        expiresAt: addDays(new Date(), 14),
      },
      include: { seller: { select: { id: true, username: true } } },
    });
    return NextResponse.json(renewed);
  }
  const updated = await prisma.bazaarListing.update({
    where: { id: existing.id },
    data: {
      title: body.title ? String(body.title).trim() : undefined,
      description: body.description !== undefined ? (String(body.description).trim() || null) : undefined,
      price: body.price !== undefined ? Number(body.price) : undefined,
      location: body.location !== undefined ? (String(body.location).trim() || null) : undefined,
      category: body.category !== undefined ? (String(body.category).trim() || null) : undefined,
      status: body.status === "SOLD" || body.status === "ARCHIVED" ? body.status : body.status === "ACTIVE" ? "ACTIVE" : undefined,
    },
    include: { seller: { select: { id: true, username: true } } },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, context: { params: { listingId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const existing = await prisma.bazaarListing.findUnique({ where: { id: context.params.listingId } });
  if (!existing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  if (existing.sellerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await prisma.bazaarListing.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}

