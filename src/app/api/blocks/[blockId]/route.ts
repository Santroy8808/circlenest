import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function DELETE(_request: Request, context: { params: { blockId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const existing = await prisma.userBlock.findUnique({ where: { id: context.params.blockId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.userId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await prisma.userBlock.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}

