import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { friendUserId?: string };
  if (!body.friendUserId) return NextResponse.json({ error: "friendUserId required" }, { status: 400 });

  const removed = await prisma.friendship.deleteMany({
    where: {
      OR: [
        { userAId: session.user.id, userBId: body.friendUserId },
        { userAId: body.friendUserId, userBId: session.user.id },
      ],
    },
  });

  return NextResponse.json({ ok: true, removed: removed.count });
}
