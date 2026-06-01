import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function PATCH(request: Request, context: { params: { requestId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { action?: "ACCEPT" | "DECLINE" };
  if (!body.action) return NextResponse.json({ error: "Action required" }, { status: 400 });

  const reqRow = await prisma.friendRequest.findUnique({ where: { id: context.params.requestId } });
  if (!reqRow) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (reqRow.receiverId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (reqRow.status !== "PENDING") return NextResponse.json({ error: "Request already resolved" }, { status: 409 });

  const status = body.action === "ACCEPT" ? "ACCEPTED" : "DECLINED";
  await prisma.friendRequest.update({ where: { id: reqRow.id }, data: { status } });

  if (status === "ACCEPTED") {
    const [userAId, userBId] = [reqRow.senderId, reqRow.receiverId].sort();
    await prisma.friendship.create({ data: { userAId, userBId } });
    await prisma.notification.create({
      data: {
        userId: reqRow.senderId,
        type: "FRIEND_ACCEPTED",
        body: "Your friend request was accepted",
        targetUrl: "/friends",
      },
    });
  }

  return NextResponse.json({ ok: true, status });
}
