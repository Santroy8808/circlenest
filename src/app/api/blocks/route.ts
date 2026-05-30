import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await prisma.userBlock.findMany({
    where: { userId: session.user.id },
    include: { blockedUser: { select: { id: true, username: true, fullName: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as { userId?: string; username?: string };
  const target =
    body.userId
      ? await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true } })
      : body.username
        ? await prisma.user.findUnique({ where: { username: body.username }, select: { id: true } })
        : null;
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.id === session.user.id) return NextResponse.json({ error: "Cannot block yourself" }, { status: 400 });

  const row = await prisma.userBlock.upsert({
    where: { userId_blockedUserId: { userId: session.user.id, blockedUserId: target.id } },
    create: { userId: session.user.id, blockedUserId: target.id },
    update: {},
  });

  await prisma.friendship.deleteMany({
    where: {
      OR: [
        { userAId: session.user.id, userBId: target.id },
        { userAId: target.id, userBId: session.user.id },
      ],
    },
  });

  await prisma.friendRequest.deleteMany({
    where: {
      OR: [
        { senderId: session.user.id, receiverId: target.id, status: "PENDING" },
        { senderId: target.id, receiverId: session.user.id, status: "PENDING" },
      ],
    },
  });

  return NextResponse.json(row);
}

