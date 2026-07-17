import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { AccountPurpose, MembershipTier, UserRole } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { consumeRateLimit } from "@/lib/platform/rate-limit";
import { getRequestContext } from "@/lib/platform/request-context";
import { authorizeCredentials, getUserSessionGuard } from "@/modules/auth-security/auth-security.service";
import { normalizeOperationalMembershipTier } from "@/modules/membership-policy/policy";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: {
    strategy: "jwt"
  },
  pages: {
    signIn: "/login"
  },
  providers: [
    Credentials({
      credentials: {
        identifier: { label: "Email or username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, request) {
        const context = getRequestContext(request);
        const identifier = typeof credentials.identifier === "string"
          ? credentials.identifier.trim().toLowerCase().slice(0, 320)
          : "missing-identifier";
        const [addressLimit, accountLimit] = await Promise.all([
          consumeRateLimit({
            namespace: "auth:credentials:address",
            key: context.ipAddress ?? "unknown-address",
            limit: 20,
            windowMs: 15 * 60 * 1000
          }),
          consumeRateLimit({
            namespace: "auth:credentials:account",
            key: identifier,
            limit: 8,
            windowMs: 15 * 60 * 1000
          })
        ]);

        if (!addressLimit.allowed || !accountLimit.allowed) return null;

        const user = await authorizeCredentials(credentials, context);

        if (!user) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.displayName,
          username: user.username,
          role: user.role,
          accountPurpose: user.accountPurpose,
          tier: user.tier,
          sessionVersion: user.sessionVersion
        };
      }
    })
  ],
  callbacks: {
    authorized({ auth: session }) {
      return Boolean(session?.user && !session.user.revoked);
    },
    async jwt({ token, user }) {
      if (user) {
        token.username = user.username;
        token.role = user.role;
        token.accountPurpose = user.accountPurpose;
        token.tier = user.tier;
        token.sessionVersion = user.sessionVersion;
        token.revoked = false;
        return token;
      }

      if (!token.sub || typeof token.sessionVersion !== "number") {
        return token;
      }

      try {
        const guard = await getUserSessionGuard(token.sub);

        if (!guard || guard.deactivatedAt || guard.sessionVersion !== token.sessionVersion) {
          token.revoked = true;
          return token;
        }

        token.role = guard.role;
        token.accountPurpose = guard.accountPurpose;
        token.tier = normalizeOperationalMembershipTier(guard.membership?.tier);
      } catch {
        token.revoked = true;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.username = token.username ?? "";
        session.user.role = token.role ?? UserRole.MEMBER;
        session.user.accountPurpose = token.accountPurpose ?? AccountPurpose.MEMBER;
        session.user.tier = token.tier ?? MembershipTier.FREE;
        session.user.sessionVersion = token.sessionVersion ?? 1;
        session.user.revoked = Boolean(token.revoked);
      }

      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    }
  },
  events: {
    async signOut(message) {
      const token = "token" in message ? message.token : undefined;

      if (token?.sub) {
        await prisma.authSecurityEvent.create({
          data: {
            type: "SESSION_REVOKED",
            userId: token.sub,
            metadata: { reason: "sign_out" }
          }
        });
      }
    }
  }
});
