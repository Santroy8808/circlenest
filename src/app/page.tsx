import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginFormClient } from "@/components/auth/login-form-client";
import { ThetaAuthShell } from "@/components/auth/theta-auth-shell";
const DESKTOP_GATE_COOKIE = "theta_desktop_gate";
const DEVICE_TOKEN_COOKIE = "theta_device_token";

function mapLoginError(error?: string) {
  switch (error) {
    case "invalid_credentials":
      return "Invalid email/username or password.";
    case "password_expired":
      return "Password expired. Reset is required every 90 days.";
    case "account_deactivated":
      return "This account is deactivated.";
    case "twofa_required":
      return "This account tier requires 2FA setup before login.";
    case "session_expired":
      return "Your 2FA session expired. Please sign in again.";
    case "missing_credentials":
      return "Enter both identifier and password.";
    case "email_not_verified":
      return "Please validate your email by clicking validate in the email we sent you.";
    case "invalid_verification_link":
      return "That validation link is invalid or expired. Please create a new account or contact support.";
    default:
      return "";
  }
}

function mapLoginNotice(notice?: string) {
  switch (notice) {
    case "email_verification_sent":
      return "Your account was created. Please validate your email by clicking validate in the email we sent you.";
    case "email_verified":
      return "Email validated successfully. You can log in now.";
    default:
      return "";
  }
}

export default async function EntryPage({ searchParams }: { searchParams?: { error?: string; email?: string; notice?: string } }) {
  const session = await auth();
  const cookieStore = cookies();
  const hasDesktopGate = Boolean(cookieStore.get(DESKTOP_GATE_COOKIE)?.value);
  const hasDeviceToken = Boolean(cookieStore.get(DEVICE_TOKEN_COOKIE)?.value);
  if (session?.user?.id && (hasDesktopGate || hasDeviceToken)) redirect("/home");

  const errorText = mapLoginError(searchParams?.error);
  const noticeText = mapLoginNotice(searchParams?.notice);

  return (
    <ThetaAuthShell
      title="Join The Stream"
      subtitle="Come on in and get some Theta-Space!"
      footer={<p>This is a private-membership platform. New users can create an account in seconds.</p>}
    >
      <h2 className="text-xl font-semibold text-[#f6e2af] md:text-2xl">Log In</h2>
      <p className="mb-3 mt-1 text-sm text-[#d3c39a] md:mb-4">Use your account credentials to continue.</p>

      <LoginFormClient
        defaultIdentifier={searchParams?.email ?? ""}
        initialError={errorText}
        initialNotice={noticeText}
      />

      {searchParams?.error === "password_expired" ? (
        <p className="mt-3 text-sm text-[#ff9f9f]">
          Password expired.{" "}
          <Link href={`/reset-password?email=${encodeURIComponent(searchParams?.email ?? "")}`} className="underline text-[#ffd47f]">
            Reset now
          </Link>
        </p>
      ) : null}

      <div className="mt-3 text-sm text-[#ccb78a] md:mt-4">
        <Link href="/reset-password" className="underline underline-offset-2">
          Forgot password?
        </Link>
      </div>
    </ThetaAuthShell>
  );
}
