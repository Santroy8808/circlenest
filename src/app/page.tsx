import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { compare } from "bcryptjs";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/auth";
import { ThetaAuthShell } from "@/components/auth/theta-auth-shell";
import { LOGIN_CHALLENGE_COOKIE, createLoginChallenge } from "@/lib/auth/login-challenge";
import { prisma } from "@/lib/db/prisma";
import { isPasswordExpired } from "@/lib/security/password-policy";

function mapLoginError(error?: string) {
  switch (error) {
    case "invalid_credentials":
      return "Invalid email/username or password.";
    case "password_expired":
      return "Password expired. Reset is required every 90 days.";
    case "twofa_required":
      return "This account tier requires 2FA setup before login.";
    case "session_expired":
      return "Your 2FA session expired. Please sign in again.";
    case "missing_credentials":
      return "Enter both identifier and password.";
    default:
      return "";
  }
}

export default async function EntryPage({ searchParams }: { searchParams?: { error?: string; email?: string } }) {
  const session = await auth();
  if (session?.user?.id) redirect("/home");

  const errorText = mapLoginError(searchParams?.error);

  return (
    <ThetaAuthShell
      title="Join The Stream"
      subtitle="Come on in and get some Theta-Space!"
      footer={<p>This is a private-membership platform. New users can create an account in seconds.</p>}
    >
      <h2 className="text-2xl font-semibold text-[#f6e2af]">Log In</h2>
      <p className="mb-4 mt-1 text-sm text-[#d3c39a]">Use your account credentials to continue.</p>

      <form
        action={async (formData) => {
          "use server";
          const identifier = String(formData.get("identifier") ?? "").trim();
          const password = String(formData.get("password") ?? "");
          if (!identifier || !password) redirect("/?error=missing_credentials");

          const normalizedIdentifier = identifier.toLowerCase();
          const looksLikeEmail = identifier.includes("@");

          const user = await prisma.user.findFirst({
            where: looksLikeEmail
              ? { OR: [{ email: identifier }, { email: normalizedIdentifier }] }
              : { OR: [{ username: identifier }, { email: normalizedIdentifier }] },
            select: { id: true, email: true, passwordHash: true, passwordUpdatedAt: true, subscriptionTier: true },
          });
          if (!user) redirect("/?error=invalid_credentials");

          const valid = await compare(password, user.passwordHash);
          if (!valid) redirect("/?error=invalid_credentials");
          if (isPasswordExpired(user.passwordUpdatedAt)) {
            redirect(`/?error=password_expired&email=${encodeURIComponent(user.email)}`);
          }

          const twoFa = await prisma.twoFactorConfig.findUnique({
            where: { userId: user.id },
            select: { enabled: true },
          });

          if (["BUSINESS", "SILVER", "GOLD", "DIAMOND"].includes(user.subscriptionTier) && !twoFa?.enabled) {
            redirect("/?error=twofa_required");
          }

          if (twoFa?.enabled) {
            const challenge = createLoginChallenge({ userId: user.id, email: user.email });
            cookies().set({
              name: LOGIN_CHALLENGE_COOKIE,
              value: challenge,
              httpOnly: true,
              sameSite: "lax",
              secure: process.env.NODE_ENV === "production",
              path: "/",
              maxAge: 60 * 10,
            });
            redirect(`/login/2fa?email=${encodeURIComponent(user.email)}`);
          }

          try {
            await signIn("credentials", { identifier, password, redirectTo: "/home" });
          } catch (error) {
            if (error instanceof AuthError) redirect("/?error=invalid_credentials");
            throw error;
          }
        }}
        className="space-y-3"
      >
        <label className="block text-xs uppercase tracking-[0.16em] text-[#e6d39f]">
          Email or Username
          <input
            name="identifier"
            type="text"
            required
            defaultValue={searchParams?.email ?? ""}
            className="mt-1 w-full rounded-lg border border-[#9d7a2e] bg-[#0e1118]/92 px-3 py-2 text-sm text-[#fff2d1] placeholder:text-[#baa77a]"
            placeholder="you@example.com or username"
          />
        </label>
        <label className="block text-xs uppercase tracking-[0.16em] text-[#e6d39f]">
          Password
          <input
            name="password"
            type="password"
            required
            minLength={14}
            className="mt-1 w-full rounded-lg border border-[#9d7a2e] bg-[#0e1118]/92 px-3 py-2 text-sm text-[#fff2d1] placeholder:text-[#baa77a]"
            placeholder="Your secure password"
          />
        </label>

        <div className="flex items-center justify-between pt-1">
          <Link href="/signup" className="rounded-md border border-[#9d7a2e] bg-[#101828] px-3 py-1.5 text-sm text-[#f4d786]">
            Create!
          </Link>
          <button type="submit" className="rounded-md border border-[#b89033] bg-gradient-to-r from-[#8e6f2c] via-[#e4bd53] to-[#8e6f2c] px-4 py-1.5 text-sm font-semibold text-[#1f1306] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
            Submit
          </button>
        </div>
      </form>

      {errorText ? (
        <p className="mt-3 text-sm text-[#ff9f9f]">
          {errorText}{" "}
          {searchParams?.error === "password_expired" ? (
            <Link href={`/reset-password?email=${encodeURIComponent(searchParams?.email ?? "")}`} className="underline text-[#ffd47f]">
              Reset now
            </Link>
          ) : null}
        </p>
      ) : null}

      <div className="mt-4 text-sm text-[#ccb78a]">
        <Link href="/reset-password" className="underline underline-offset-2">
          Forgot password?
        </Link>
      </div>
    </ThetaAuthShell>
  );
}
