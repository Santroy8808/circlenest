import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { otherUserId?: string };
  if (!body.otherUserId) return NextResponse.json({ error: "otherUserId required" }, { status: 400 });

  const [mine, theirs] = await Promise.all([
    prisma.friendship.findMany({ where: { OR: [{ userAId: session.user.id }, { userBId: session.user.id }] } }),
    prisma.friendship.findMany({ where: { OR: [{ userAId: body.otherUserId }, { userBId: body.otherUserId }] } }),
  ]);

  const mineSet = new Set(mine.map((f) => (f.userAId === session.user.id ? f.userBId : f.userAId)));
  const mutualIds = theirs.map((f) => (f.userAId === body.otherUserId ? f.userBId : f.userAId)).filter((id) => mineSet.has(id));

  const users = await prisma.user.findMany({ where: { id: { in: mutualIds } }, select: { id: true, username: true } });
  return NextResponse.json(users);
}
