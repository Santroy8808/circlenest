import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getR2ConfigSummary, verifyR2WriteAccess } from "@/lib/security/upload-storage";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    ok: true,
    storage: getR2ConfigSummary(),
    r2WriteTest: await verifyR2WriteAccess(),
  });
}
