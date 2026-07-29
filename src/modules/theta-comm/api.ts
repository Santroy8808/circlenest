import { NextResponse } from "next/server";
import { diagnostics } from "@/lib/platform/logging";
import { ThetaCommError } from "@/modules/theta-comm/theta-comm.shared";

export async function thetaCommApiError(error: unknown) {
  if (error instanceof ThetaCommError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: { "cache-control": "no-store" } }
    );
  }
  await diagnostics.error("theta-comm-v2", "Unhandled Theta-Comm API failure.", {
    error: error instanceof Error ? error.message : "unknown"
  });
  return NextResponse.json(
    { error: "Theta-Comm could not complete that request.", code: "INTERNAL_ERROR" },
    { status: 500, headers: { "cache-control": "no-store" } }
  );
}
