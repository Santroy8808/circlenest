import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createGroupForUser } from "@/modules/groups/groups.service";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const memberships = await prisma.groupMember.findMany({
    where: { userId: session.user.id },
    select: {
      role: true,
      group: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    memberships.map((membership) => ({
      id: membership.group.id,
      name: membership.group.name,
      role: membership.role,
    })),
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    name?: string;
    description?: string;
    visibility?: "PUBLIC" | "PRIVATE";
    joinMode?: "OPEN" | "REQUEST";
  };
  const result = await createGroupForUser(session.user.id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.group);
}
