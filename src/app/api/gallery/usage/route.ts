import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserUploadLimitBytes, getUserUploadUsageBytes } from "@/lib/media/storage-quota";
import { secureAreaLockedResponse } from "@/lib/security/secure-area-guards";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const locked = secureAreaLockedResponse(session.user.id);
  if (locked) return locked;

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
