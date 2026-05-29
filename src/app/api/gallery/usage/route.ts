import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { ACCOUNT_UPLOAD_LIMIT_BYTES } from "@/lib/media/storage-quota";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const aggregate = await prisma.userUploadAsset.aggregate({
    where: { userId: session.user.id },
    _sum: { sizeBytes: true },
  });
  const usedBytes = aggregate._sum.sizeBytes ?? 0;
  return NextResponse.json({
    usedBytes,
    limitBytes: ACCOUNT_UPLOAD_LIMIT_BYTES,
    remainingBytes: Math.max(0, ACCOUNT_UPLOAD_LIMIT_BYTES - usedBytes),
  });
}
