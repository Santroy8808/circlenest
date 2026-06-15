import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { canManageGroupAssets } from "@/modules/groups/group-assets.service";

export async function POST(request: Request, context: { params: { groupId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const permission = await canManageGroupAssets(session.user.id, context.params.groupId);
  if (!permission.ok) return NextResponse.json({ error: permission.error }, { status: permission.status });

  const body = (await request.json()) as { title?: string; url?: string; sizeBytes?: number };
  if (!body.title?.trim() || !body.url?.trim()) return NextResponse.json({ error: "title and url required" }, { status: 400 });

  const doc = await prisma.groupDocument.create({
    data: {
      groupId: context.params.groupId,
      uploaderId: session.user.id,
      title: body.title.trim(),
      url: body.url.trim(),
      sizeBytes: Math.max(0, Math.floor(Number(body.sizeBytes ?? 0))),
    },
  });

  return NextResponse.json(doc);
}

