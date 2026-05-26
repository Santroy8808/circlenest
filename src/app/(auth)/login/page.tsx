import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export default function LoginPage({ searchParams }: { searchParams?: { error?: string } }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#080808]">
      <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, #2a2a2a 0%, transparent 45%), radial-gradient(circle at 80% 60%, #1f1f1f 0%, transparent 40%), linear-gradient(135deg, #0b0b0d 0%, #121212 50%, #080808 100%)" }} />
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "repeating-linear-gradient(45deg, #000 0, #000 2px, transparent 2px, transparent 8px)" }} />

      <div className="relative mx-auto flex min-h-screen max-w-6xl items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-[#7a6430] bg-gradient-to-b from-[#171717] via-[#101010] to-[#0a0a0a] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.65)]">
          <div className="mb-5 text-center">
            <p className="text-2xl tracking-[0.35em] text-[#d4af37]">△ ∞</p>
            <h1 className="mt-2 text-3xl font-bold tracking-wide text-[#e6cc7a]" style={{ textShadow: "0 1px 0 #6b531f, 0 8px 18px rgba(212,175,55,0.25)" }}>
              CircleNest
            </h1>
            <p className="mt-1 text-sm text-[#c6b07a]">Drakudai Gate</p>
          </div>

          <form
            action={async (formData) => {
              "use server";
              try {
                await signIn("credentials", {
                  email: String(formData.get("email") ?? ""),
                  password: String(formData.get("password") ?? ""),
                  otp: String(formData.get("otp") ?? ""),
                  redirectTo: "/home",
                });
              } catch (error) {
                if (error instanceof AuthError) redirect("/login?error=invalid_credentials");
                throw error;
              }
            }}
            className="space-y-3"
          >
            <input name="email" type="email" required placeholder="Email" className="w-full rounded-lg border border-[#5d4a1f] bg-[#0f0f0f] px-3 py-2 text-[#f4e2a6] placeholder:text-[#9b8a58]" />
            <input name="password" type="password" required placeholder="Password" className="w-full rounded-lg border border-[#5d4a1f] bg-[#0f0f0f] px-3 py-2 text-[#f4e2a6] placeholder:text-[#9b8a58]" />
            <input name="otp" placeholder="2FA code (if enabled)" className="w-full rounded-lg border border-[#5d4a1f] bg-[#0f0f0f] px-3 py-2 text-[#f4e2a6] placeholder:text-[#9b8a58]" />
            <button type="submit" className="w-full rounded-lg bg-gradient-to-r from-[#8e6f2c] via-[#d4af37] to-[#8e6f2c] px-3 py-2 font-semibold text-[#1b1204] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
              Enter CircleNest
            </button>
          </form>
          {searchParams?.error === "invalid_credentials" ? <p className="mt-3 text-sm text-red-400">Invalid email, password, or 2FA code.</p> : null}
          <div className="mt-4 flex items-center justify-between text-sm text-[#b79f65]">
            <Link href="/reset-password" prefetch={false} className="underline decoration-[#8e6f2c] underline-offset-2">Forgot password?</Link>
            <Link href="/signup" prefetch={false} className="underline decoration-[#8e6f2c] underline-offset-2">Create account</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
