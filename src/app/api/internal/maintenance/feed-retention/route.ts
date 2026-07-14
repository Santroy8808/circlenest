import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { applyPublicStreamRetentionPolicy } from "@/modules/feed-stream/feed-retention.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MIN_SECRET_LENGTH = 32;

function readBearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function safeEqual(value: string, expected: string) {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return valueBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(valueBuffer, expectedBuffer);
}

function readMaintenanceSecret() {
  const secret = process.env.MAINTENANCE_JOB_SECRET?.trim();
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

export async function POST(request: NextRequest) {
  const secret = readMaintenanceSecret();
  if (!secret) {
    return NextResponse.json({ error: "Maintenance job secret is not configured." }, { status: 503 });
  }

  if (!safeEqual(readBearerToken(request), secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await applyPublicStreamRetentionPolicy();
  return NextResponse.json({
    ...result,
    ranAt: new Date().toISOString()
  });
}
