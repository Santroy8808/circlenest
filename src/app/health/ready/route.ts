import { NextResponse } from "next/server";
import { getPlatformHealthReport } from "@/lib/platform/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const report = await getPlatformHealthReport();
  return NextResponse.json(report, { status: report.ok ? 200 : 503 });
}
