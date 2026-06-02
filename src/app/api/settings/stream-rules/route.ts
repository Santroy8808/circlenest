import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const pref = await prisma.userFeedPreference.findUnique({
    where: { userId: session.user.id },
    select: {
      allowFriendFamilyStreamPosts: true,
      requireApprovalForFriendFamilyStreamPosts: true,
    },
  });
  return NextResponse.json({
    allowFriendFamilyStreamPosts: pref?.requireApprovalForFriendFamilyStreamPosts ? false : (pref?.allowFriendFamilyStreamPosts ?? true),
    requireApprovalForFriendFamilyStreamPosts: pref?.requireApprovalForFriendFamilyStreamPosts ?? false,
  });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as {
    allowFriendFamilyStreamPosts?: boolean;
    requireApprovalForFriendFamilyStreamPosts?: boolean;
  };
  const approval = Boolean(body.requireApprovalForFriendFamilyStreamPosts);
  const pref = await prisma.userFeedPreference.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      allowFriendFamilyStreamPosts: !approval,
      requireApprovalForFriendFamilyStreamPosts: approval,
    },
    update: {
      allowFriendFamilyStreamPosts: !approval,
      requireApprovalForFriendFamilyStreamPosts: approval,
    },
    select: {
      allowFriendFamilyStreamPosts: true,
      requireApprovalForFriendFamilyStreamPosts: true,
    },
  });
  return NextResponse.json(pref);
}

