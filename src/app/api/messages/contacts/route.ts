import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const links = await prisma.friendship.findMany({
    where: { OR: [{ userAId: session.user.id }, { userBId: session.user.id }] },
    select: { userAId: true, userBId: true },
  });
  const friendIds = links.map((link) => (link.userAId === session.user.id ? link.userBId : link.userAId));

  const contacts = await prisma.user.findMany({
    where: { id: { in: friendIds } },
    select: {
      id: true,
      username: true,
      fullName: true,
      profile: { select: { displayName: true, avatarUrl: true } },
    },
    orderBy: [{ username: "asc" }],
  });

  return NextResponse.json(contacts);
}
