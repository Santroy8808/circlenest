import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { secureAreaLockedResponse } from "@/lib/security/secure-area-guards";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const locked = secureAreaLockedResponse(session.user.id);
  if (locked) return locked;

  const tags = await prisma.userMediaTag.findMany({
    where: { userId: session.user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true, createdAt: true },
  });
  return NextResponse.json(tags);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const locked = secureAreaLockedResponse(session.user.id);
  if (locked) return locked;

  const body = (await request.json()) as { name?: string };
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Tag name required" }, { status: 400 });

  const tag = await prisma.userMediaTag.upsert({
    where: { userId_name: { userId: session.user.id, name } },
    update: {},
    create: { userId: session.user.id, name },
  });
  return NextResponse.json(tag);
}
