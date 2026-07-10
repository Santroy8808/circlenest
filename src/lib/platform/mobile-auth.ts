import { NextRequest } from "next/server";
import { MembershipTier, UserRole } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { signMobileAuthPayload, verifyMobileAuthSignature } from "@/modules/auth-security/mobile-secret";

type MobileTokenPayload = {
  userId: string;
  sessionVersion: number;
  exp: number;
};

export type MobileSession = {
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

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(value: string) {
  return signMobileAuthPayload(value);
}

export function createMobileToken(input: { userId: string; sessionVersion: number }) {
  const payload: MobileTokenPayload = {
    userId: input.userId,
    sessionVersion: input.sessionVersion,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30
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
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.profile?.displayName ?? user.username,
      role: user.role,
      tier: user.membership?.tier ?? MembershipTier.FREE,
      sessionVersion: user.sessionVersion
    }
  };
}
