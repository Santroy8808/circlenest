import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const links = await prisma.friendship.findMany({ where: { OR: [{ userAId: session.user.id }, { userBId: session.user.id }] } });
  const friendIds = new Set(links.map((f) => (f.userAId === session.user.id ? f.userBId : f.userAId)));
  friendIds.add(session.user.id);

  const users = await prisma.user.findMany({ where: { id: { notIn: Array.from(friendIds) } }, select: { id: true, username: true }, take: 8 });
  return NextResponse.json(users);
}
