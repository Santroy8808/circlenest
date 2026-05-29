import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/auth";
import { ThetaAuthShell } from "@/components/auth/theta-auth-shell";
import { LOGIN_CHALLENGE_COOKIE, verifyLoginChallenge } from "@/lib/auth/login-challenge";

function mapError(error?: string) {
  switch (error) {
    case "invalid_otp":
      return "Invalid 2FA code. Enter the current 6-digit code.";
    case "session_expired":
      return "Login verification expired. Start login again.";
    default:
      return "";
  }
}

export default async function LoginTwoFactorPage({ searchParams }: { searchParams?: { error?: string; email?: string } }) {
  const session = await auth();
  if (session?.user?.id) redirect("/home");

  const challenge = cookies().get(LOGIN_CHALLENGE_COOKIE)?.value;
  if (!challenge || !verifyLoginChallenge(challenge)) redirect("/?error=session_expired");

  const email = searchParams?.email ?? verifyLoginChallenge(challenge)?.email ?? "";
  const error = mapError(searchParams?.error);

  return (
    <ThetaAuthShell
      title="Two-Factor Verification"
      subtitle="Enter your 6-digit authenticator code to finish sign-in."
      footer={
        <p>
          Need to restart?{" "}
          <Link href="/" className="underline underline-offset-2">
            Back to login
          </Link>
        </p>
      }
    >
      <h2 className="text-2xl font-semibold text-[#f6e2af]">2FA Code</h2>
      <p className="mb-4 mt-1 text-sm text-[#d3c39a]">
        Account: <span className="text-[#f6e2af]">{email}</span>
      </p>

      <form
        action={async (formData) => {
          "use server";
          const otp = String(formData.get("otp") ?? "").trim();
          const token = cookies().get(LOGIN_CHALLENGE_COOKIE)?.value;
          const verified = token ? verifyLoginChallenge(token) : null;
          if (!token || !verified) redirect("/?error=session_expired");
          if (!/^\d{6}$/.test(otp)) redirect(`/login/2fa?error=invalid_otp&email=${encodeURIComponent(verified.email)}`);

          try {
            await signIn("credentials", {
              challenge: token,
              otp,
              redirectTo: "/home",
            });
          } catch (authError) {
            if (authError instanceof AuthError) {
              redirect(`/login/2fa?error=invalid_otp&email=${encodeURIComponent(verified.email)}`);
            }
            throw authError;
          }
        }}
        className="space-y-3"
      >
        <label className="block text-xs uppercase tracking-[0.16em] text-[#e6d39f]">
          Six-digit code
          <input
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\\d{6}"
            maxLength={6}
            required
            className="mt-1 w-full rounded-lg border border-[#9d7a2e] bg-[#0e1118]/92 px-3 py-2 text-center text-lg tracking-[0.3em] text-[#fff2d1] placeholder:text-[#baa77a]"
            placeholder="000000"
          />
        </label>

        <div className="flex items-center justify-between pt-1">
          <Link href="/" className="rounded-md border border-[#9d7a2e] bg-[#101828] px-3 py-1.5 text-sm text-[#f4d786]">
            Back
          </Link>
          <button type="submit" className="rounded-md border border-[#b89033] bg-gradient-to-r from-[#8e6f2c] via-[#e4bd53] to-[#8e6f2c] px-4 py-1.5 text-sm font-semibold text-[#1f1306] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
            Verify
          </button>
        </div>
      </form>

      {error ? <p className="mt-3 text-sm text-[#ff9f9f]">{error}</p> : null}
    </ThetaAuthShell>
  );
}

