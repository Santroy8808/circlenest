import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import speakeasy from "speakeasy";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { verifyLoginChallenge } from "@/lib/auth/login-challenge";
import { isPasswordExpired } from "@/lib/security/password-policy";

const loginSchema = z.object({
  identifier: z.string().min(1).optional(),
  email: z.string().min(1).optional(),
  password: z.string().min(8).max(72).optional(),
  otp: z.string().optional(),
  challenge: z.string().optional(),
});

const tiersRequiringTwoFa = new Set(["BUSINESS", "SILVER", "GOLD", "DIAMOND"]);
const requireTierTwoFa = process.env.REQUIRE_2FA_BY_TIER === "true";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        identifier: { label: "Email or Username", type: "text" },
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        otp: { label: "OTP", type: "text" },
        challenge: { label: "Challenge", type: "text" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const challenge = parsed.data.challenge?.trim();
        if (challenge) {
          const verified = verifyLoginChallenge(challenge);
          if (!verified) return null;

          const user = await prisma.user.findUnique({ where: { id: verified.userId } });
          if (!user || user.email !== verified.email) return null;
          if (isPasswordExpired(user.passwordUpdatedAt)) return null;

          const twoFa = await prisma.twoFactorConfig.findUnique({ where: { userId: user.id } });
          if (!twoFa?.enabled) return null;

          const otp = parsed.data.otp?.trim();
          if (!otp) return null;
          if (!speakeasy.totp.verify({ secret: twoFa.secret, encoding: "base32", token: otp })) return null;

          return {
            id: user.id,
            email: user.email,
            name: user.username,
            sessionVersion: user.sessionVersion,
          };
        }

        const identifier = parsed.data.identifier?.trim() || parsed.data.email?.trim();
        if (!identifier || !parsed.data.password) return null;
        const loweredIdentifier = identifier.toLowerCase();
        const looksLikeEmail = identifier.includes("@");

        const user = await prisma.user.findFirst({
          where: looksLikeEmail
            ? { OR: [{ email: identifier }, { email: loweredIdentifier }] }
            : { OR: [{ username: identifier }, { email: loweredIdentifier }] },
        });
        if (!user) return null;
        const pendingVerification = await prisma.emailVerificationToken.findFirst({
          where: { userId: user.id, expiresAt: { gt: new Date() } },
          select: { id: true },
        });
        if (pendingVerification) return null;

        const valid = await compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        if (isPasswordExpired(user.passwordUpdatedAt)) return null;

        const twoFa = await prisma.twoFactorConfig.findUnique({ where: { userId: user.id } });
        if (requireTierTwoFa && tiersRequiringTwoFa.has(user.subscriptionTier) && !twoFa?.enabled) return null;
        if (twoFa?.enabled) {
          const otp = parsed.data.otp?.trim();
          if (!otp) return null;
          if (!speakeasy.totp.verify({ secret: twoFa.secret, encoding: "base32", token: otp })) return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.username,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.sessionVersion = (user as { sessionVersion?: number }).sessionVersion ?? 1;
      }
      if (typeof token.userId === "string") {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.userId },
          select: { sessionVersion: true },
        });
        if (!dbUser || dbUser.sessionVersion !== token.sessionVersion) {
          token.invalidated = true;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.invalidated) {
        if (session.user) session.user.id = "";
        return session;
      }
      if (session.user) {
        session.user.id = typeof token.userId === "string" ? token.userId : "";
      }
      return session;
    },
  },
});
