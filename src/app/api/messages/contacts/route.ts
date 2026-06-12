import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const me = session.user.id;
  const links = await prisma.friendship.findMany({ where: { OR: [{ userAId: me }, { userBId: me }] } });
  const friendIds = links.map((link) => (link.userAId === me ? link.userBId : link.userAId));
  const friends = await prisma.user.findMany({
    where: { id: { in: friendIds } },
    select: {
      id: true,
      username: true,
      fullName: true,
      profile: { select: { displayName: true, avatarUrl: true } },
    },
    orderBy: { username: "asc" },
  });

  return NextResponse.json(friends);
}
