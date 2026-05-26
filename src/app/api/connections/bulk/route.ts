import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

type BulkAction = "FOLLOW" | "UNFOLLOW" | "SEND_REQUEST" | "UNFRIEND";

type BulkBody = {
  action?: BulkAction;
  userIds?: string[];
};

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as BulkBody;
  const action = body.action;
  const userIds = Array.from(new Set((body.userIds || []).filter((id) => id && id !== session.user.id)));

  if (!action || !userIds.length) return NextResponse.json({ error: "action and userIds required" }, { status: 400 });

  let changed = 0;

  if (action === "FOLLOW") {
    for (const targetId of userIds) {
      await prisma.userFollow.upsert({
        where: { followerId_followingId: { followerId: session.user.id, followingId: targetId } },
        create: { followerId: session.user.id, followingId: targetId },
        update: {},
      });
      changed++;
    }
  }

  if (action === "UNFOLLOW") {
    const res = await prisma.userFollow.deleteMany({
      where: { followerId: session.user.id, followingId: { in: userIds } },
    });
    changed = res.count;
  }

  if (action === "UNFRIEND") {
    for (const targetId of userIds) {
      const res = await prisma.friendship.deleteMany({
        where: {
          OR: [
            { userAId: session.user.id, userBId: targetId },
            { userAId: targetId, userBId: session.user.id },
          ],
        },
      });
      changed += res.count;
    }
  }

  if (action === "SEND_REQUEST") {
    for (const targetId of userIds) {
      const alreadyFriend = await prisma.friendship.findFirst({
        where: {
          OR: [
            { userAId: session.user.id, userBId: targetId },
            { userAId: targetId, userBId: session.user.id },
          ],
        },
      });
      if (alreadyFriend) continue;

      const pending = await prisma.friendRequest.findFirst({
        where: {
          OR: [
            { senderId: session.user.id, receiverId: targetId, status: "PENDING" },
            { senderId: targetId, receiverId: session.user.id, status: "PENDING" },
          ],
        },
      });
      if (pending) continue;

      await prisma.friendRequest.create({
        data: { senderId: session.user.id, receiverId: targetId, status: "PENDING" },
      });
      await prisma.notification.create({
        data: { userId: targetId, type: "FRIEND_REQUEST", body: "You received a friend request" },
      });
      changed++;
    }
  }

  return NextResponse.json({ ok: true, changed });
}
