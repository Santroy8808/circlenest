import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserUploadLimitBytes, getUserUploadUsageBytes } from "@/lib/media/storage-quota";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [usedBytes, limitBytes] = await Promise.all([
    getUserUploadUsageBytes(session.user.id),
    getUserUploadLimitBytes(session.user.id),
  ]);
  return NextResponse.json({
    usedBytes,
    limitBytes,
    remainingBytes: Math.max(0, limitBytes - usedBytes),
  });
}
