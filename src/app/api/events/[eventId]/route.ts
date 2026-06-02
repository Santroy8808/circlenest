import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canModerateEvent } from "@/lib/auth/scoped-moderation";
import { prisma } from "@/lib/db/prisma";

export async function PATCH(request: Request, context: { params: { eventId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.event.findUnique({ where: { id: context.params.eventId } });
  if (!existing) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (!(await canModerateEvent(session.user.id, existing.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as { title?: string; description?: string; startsAt?: string; endsAt?: string; locationName?: string };
  const updated = await prisma.event.update({
    where: { id: existing.id },
    data: {
      title: body.title ? String(body.title).trim() : undefined,
      description: body.description !== undefined ? (String(body.description).trim() || null) : undefined,
      startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
      endsAt: body.endsAt ? new Date(body.endsAt) : body.endsAt === "" ? null : undefined,
      locationName: body.locationName !== undefined ? (String(body.locationName).trim() || null) : undefined,
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, context: { params: { eventId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.event.findUnique({ where: { id: context.params.eventId } });
  if (!existing) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (!(await canModerateEvent(session.user.id, existing.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.event.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}

