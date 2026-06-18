import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { MembershipTier, UserRole } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { authorizeCredentials, getUserSessionGuard } from "@/modules/auth-security/auth-security.service";

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
        const userAgent = request.headers.get("user-agent") ?? undefined;
        const forwardedFor = request.headers.get("x-forwarded-for") ?? undefined;
        const user = await authorizeCredentials(credentials, {
          ipAddress: forwardedFor?.split(",")[0]?.trim(),
          userAgent
        });

        if (!user) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.displayName,
          username: user.username,
          role: user.role,
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
        token.tier = guard.membership?.tier ?? MembershipTier.FREE;
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
