import type { DefaultSession } from "next-auth";
import type { JWT as DefaultJWT } from "next-auth/jwt";
import type { MembershipTier, UserRole } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      role: UserRole;
      tier: MembershipTier;
      sessionVersion: number;
      revoked?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    username: string;
    role: UserRole;
    tier: MembershipTier;
    sessionVersion: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    username?: string;
    role?: UserRole;
    tier?: MembershipTier;
    sessionVersion?: number;
    revoked?: boolean;
  }
}
