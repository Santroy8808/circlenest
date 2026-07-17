import { NextRequest, NextResponse } from "next/server";
import { MembershipTier, UserRole } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { signMobileAuthPayload, verifyMobileAuthSignature } from "@/modules/auth-security/mobile-secret";
import { normalizeOperationalMembershipTier } from "@/modules/membership-policy/policy";

type MobileTokenPayload = {
  userId: string;
  sessionVersion: number;
  deviceId?: string;
  exp: number;
};

export type MobileSession = {
  deviceId: string | null;
  user: {
    id: string;
    email: string;
    username: string;
    displayName: string;
    role: UserRole;
    tier: MembershipTier;
    sessionVersion: number;
  };
};

export function mobileAuthUnavailableResponse() {
  if ((process.env.MOBILE_AUTH_SECRET?.trim().length ?? 0) >= 32) return null;

  return NextResponse.json(
    { error: "Mobile authentication is temporarily unavailable." },
    {
      status: 503,
      headers: {
        "cache-control": "no-store",
        "retry-after": "300"
      }
    }
  );
}

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(value: string) {
  return signMobileAuthPayload(value);
}

const MOBILE_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365;

export function readMobileDeviceId(request: NextRequest) {
  const value = request.headers.get("x-theta-device-id")?.trim() ?? "";
  return /^[A-Za-z0-9_-]{16,128}$/.test(value) ? value : null;
}

export function createMobileToken(input: { userId: string; sessionVersion: number; deviceId?: string | null }) {
  const payload: MobileTokenPayload = {
    userId: input.userId,
    sessionVersion: input.sessionVersion,
    ...(input.deviceId ? { deviceId: input.deviceId } : {}),
    exp: Math.floor(Date.now() / 1000) + MOBILE_TOKEN_TTL_SECONDS
  };
  const encodedPayload = base64Url(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function readBearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? "";
}

function verifyMobileToken(token: string): MobileTokenPayload | null {
  if (token.length > 2_048) return null;

  const segments = token.split(".");
  if (segments.length !== 2) return null;

  const [encodedPayload, signature] = segments;

  if (!encodedPayload || !signature) return null;
  if (!verifyMobileAuthSignature(encodedPayload, signature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as MobileTokenPayload;
    if (
      !payload.userId ||
      !Number.isInteger(payload.sessionVersion) ||
      payload.sessionVersion < 0 ||
      !Number.isInteger(payload.exp) ||
      payload.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function requireMobileSession(request: NextRequest): Promise<MobileSession | null> {
  const payload = verifyMobileToken(readBearerToken(request));
  if (!payload) return null;
  const requestDeviceId = readMobileDeviceId(request);
  if (payload.deviceId && payload.deviceId !== requestDeviceId) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: {
      membership: true,
      profile: true
    }
  });

  if (!user || user.deactivatedAt || user.sessionVersion !== payload.sessionVersion) {
    return null;
  }

  return {
    deviceId: payload.deviceId ?? requestDeviceId,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.profile?.displayName ?? user.username,
      role: user.role,
      tier: normalizeOperationalMembershipTier(user.membership?.tier),
      sessionVersion: user.sessionVersion
    }
  };
}
