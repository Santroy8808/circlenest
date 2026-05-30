import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { username?: string };
  if (!body.username) return NextResponse.json({ error: "Username required" }, { status: 400 });

  const receiver = await prisma.user.findUnique({ where: { username: body.username } });
  if (!receiver) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (receiver.id === session.user.id) return NextResponse.json({ error: "Cannot friend yourself" }, { status: 400 });

  const blocked = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { userId: session.user.id, blockedUserId: receiver.id },
        { userId: receiver.id, blockedUserId: session.user.id },
      ],
    },
    select: { id: true },
  });
  if (blocked) return NextResponse.json({ error: "Friend request blocked by user settings." }, { status: 403 });

  const existsFriend = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userAId: session.user.id, userBId: receiver.id },
        { userAId: receiver.id, userBId: session.user.id },
      ],
    },
  });
  if (existsFriend) return NextResponse.json({ error: "Already friends" }, { status: 409 });

  const existingReq = await prisma.friendRequest.findFirst({
    where: {
      OR: [
        { senderId: session.user.id, receiverId: receiver.id, status: "PENDING" },
        { senderId: receiver.id, receiverId: session.user.id, status: "PENDING" },
      ],
    },
  });
  if (existingReq) return NextResponse.json({ error: "Request already pending" }, { status: 409 });

  const requestRow = await prisma.friendRequest.create({
    data: {
      senderId: session.user.id,
      receiverId: receiver.id,
      status: "PENDING",
    },
  });

  await prisma.notification.create({
    data: {
      userId: receiver.id,
      type: "FRIEND_REQUEST",
      body: "You received a friend request",
    },
  });

  return NextResponse.json(requestRow);
}
