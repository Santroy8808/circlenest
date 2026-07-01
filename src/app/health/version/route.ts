import { NextResponse } from "next/server";
import { getPlatformReleaseInfo } from "@/lib/platform/release";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    release: getPlatformReleaseInfo()
  });
}
