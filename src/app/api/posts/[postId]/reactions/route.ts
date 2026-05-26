import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request, context: { params: { postId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { type?: string };
  const type = body.type?.toUpperCase() || "LIKE";

  await prisma.reaction.deleteMany({ where: { postId: context.params.postId, userId: session.user.id } });
  const reaction = await prisma.reaction.create({ data: { postId: context.params.postId, userId: session.user.id, type } });

  return NextResponse.json(reaction);
}
