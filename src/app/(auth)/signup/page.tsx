"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { validateStrongPassword } from "@/lib/security/password-policy";
import { CURRENT_TERMS_VERSION } from "@/lib/security/terms";

const INTEREST_OPTIONS = ["Technology", "Science", "Gaming", "Music", "Movies", "Books", "Travel", "Fitness", "Art", "Business", "Family", "News", "Sports", "Health", "Education", "Spirituality"];

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [formStartedAt] = useState(() => Date.now());
  const turnstileSiteKey = useMemo(() => process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "", []);
  const [form, setForm] = useState({
    inviteCode: "",
    fullName: "",
    email: "",
    phoneNumber: "",
    backupEmail: "",
    recoveryPhoneNumber: "",
    username: "",
    password: "",
    confirmPassword: "",
    city: "",
    state: "",
    country: "",
    lastOnLinesAt: "",
    lastService: "",
    lastServiceWhen: "",
    iasStatus: "",
    iasNumber: "",
    acceptedTerms: false,
    subscriptionTier: "FREE",
    interest1: "",
    interest2: "",
    interest3: "",
    interest4: "",
    interest5: "",
    website: "",
  });

  useEffect(() => {
    const inviteFromUrl = new URLSearchParams(window.location.search).get("invite")?.trim() ?? "";
    if (inviteFromUrl) {
      setForm((prev) => (prev.inviteCode === inviteFromUrl ? prev : { ...prev, inviteCode: inviteFromUrl }));
    }
  }, []);

  useEffect(() => {
    (window as typeof window & { onTurnstileSuccess?: (token: string) => void; onTurnstileExpired?: () => void }).onTurnstileSuccess = (token: string) => {
      setTurnstileToken(token);
    };
    (window as typeof window & { onTurnstileSuccess?: (token: string) => void; onTurnstileExpired?: () => void }).onTurnstileExpired = () => {
      setTurnstileToken("");
    };
    return () => {
      (window as typeof window & { onTurnstileSuccess?: (token: string) => void; onTurnstileExpired?: () => void }).onTurnstileSuccess = undefined;
      (window as typeof window & { onTurnstileSuccess?: (token: string) => void; onTurnstileExpired?: () => void }).onTurnstileExpired = undefined;
    };
  }, []);

  return (
    <main className="mx-auto max-w-2xl p-4">
      <div className="card p-4">
        <h1 className="mb-3 text-lg font-semibold text-[var(--text-strong)]">Create Account</h1>
        <p className="mb-1 text-xs text-slate-300">This data stays on this platform and is not sold to outside companies.</p>
        <p className="mb-3 text-xs text-slate-300">An invitation code is required. New members start Free and upgrade later.</p>
        <form
          className="grid gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            setError(null);
            const interests = [form.interest1, form.interest2, form.interest3, form.interest4, form.interest5].map((v) => v.trim()).filter(Boolean);
            if (new Set(interests).size < 5) {
              setError("Pick 5 unique interests.");
              return;
            }

            const passwordError = validateStrongPassword(form.password);
            if (passwordError) {
              setError(passwordError);
              return;
            }

            if (form.password !== form.confirmPassword) {
              setError("Passwords do not match.");
              return;
            }
            if (turnstileSiteKey && !turnstileToken) {
              setError("Please complete human verification.");
              return;
            }

            const res = await fetch("/api/auth/signup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                inviteCode: form.inviteCode,
                fullName: form.fullName,
                email: form.email,
                phoneNumber: form.phoneNumber,
                backupEmail: form.backupEmail,
                recoveryPhoneNumber: form.recoveryPhoneNumber,
                username: form.username,
                password: form.password,
                city: form.city,
                state: form.state,
                country: form.country,
                lastOnLinesAt: form.lastOnLinesAt,
                lastService: form.lastService,
                lastServiceWhen: form.lastServiceWhen,
                iasStatus: form.iasStatus,
                iasNumber: form.iasNumber,
                acceptedTerms: form.acceptedTerms,
                subscriptionTier: form.subscriptionTier,
                interests,
                turnstileToken,
                website: form.website,
                formStartedAt,
              }),
            });
            if (!res.ok) {
              const body = (await res.json()) as { error?: string; fieldErrors?: Record<string, string[] | undefined> };
              const firstFieldError = body.fieldErrors
                ? Object.values(body.fieldErrors).flat().find((message): message is string => typeof message === "string" && message.trim().length > 0)
                : undefined;
              setError(firstFieldError ?? body.error ?? "Signup failed");
              return;
            }
            router.push("/?notice=email_verification_sent");
          }}
        >
          <input
            name="inviteCode"
            value={form.inviteCode}
            onChange={(e) => setForm((prev) => ({ ...prev, inviteCode: e.target.value }))}
            required
            placeholder="Invitation Code"
            className="rounded-md border px-2 py-1.5 text-sm"
          />
          <input name="fullName" value={form.fullName} onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))} required placeholder="Full Name" className="rounded-md border px-2 py-1.5 text-sm" />
          <div className="grid gap-2 md:grid-cols-2">
            <input name="email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} type="email" required placeholder="Email" className="rounded-md border px-2 py-1.5 text-sm" />
            <input name="phoneNumber" value={form.phoneNumber} onChange={(e) => setForm((prev) => ({ ...prev, phoneNumber: e.target.value }))} required placeholder="Phone Number" className="rounded-md border px-2 py-1.5 text-sm" />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <input name="backupEmail" value={form.backupEmail} onChange={(e) => setForm((prev) => ({ ...prev, backupEmail: e.target.value }))} type="email" placeholder="Recovery Email" className="rounded-md border px-2 py-1.5 text-sm" />
            <input name="recoveryPhoneNumber" value={form.recoveryPhoneNumber} onChange={(e) => setForm((prev) => ({ ...prev, recoveryPhoneNumber: e.target.value }))} placeholder="Recovery Phone Number" className="rounded-md border px-2 py-1.5 text-sm" />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <input name="username" value={form.username} onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))} required placeholder="Username" className="rounded-md border px-2 py-1.5 text-sm" />
            <div className="grid gap-2 md:grid-cols-2">
              <input name="password" value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} type="password" required minLength={8} placeholder="Password (8+ chars incl capital/number/symbol)" className="rounded-md border px-2 py-1.5 text-sm" />
              <input name="confirmPassword" value={form.confirmPassword} onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))} type="password" required minLength={8} placeholder="Confirm Password" className="rounded-md border px-2 py-1.5 text-sm" />
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <input name="city" value={form.city} onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))} required placeholder="City" className="rounded-md border px-2 py-1.5 text-sm" />
            <input name="state" value={form.state} onChange={(e) => setForm((prev) => ({ ...prev, state: e.target.value }))} required placeholder="State" className="rounded-md border px-2 py-1.5 text-sm" />
            <input name="country" value={form.country} onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))} required placeholder="Country" className="rounded-md border px-2 py-1.5 text-sm" />
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <label className="grid gap-1 text-xs text-slate-300">
              <span>Current org</span>
              <input
                name="lastOnLinesAt"
                value={form.lastOnLinesAt}
                onChange={(e) => setForm((prev) => ({ ...prev, lastOnLinesAt: e.target.value }))}
                placeholder="Current org"
                className="rounded-md border px-2 py-1.5 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs text-slate-300">
              <span>Last service done</span>
              <input
                name="lastService"
                value={form.lastService}
                onChange={(e) => setForm((prev) => ({ ...prev, lastService: e.target.value }))}
                placeholder="Last service done"
                className="rounded-md border px-2 py-1.5 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs text-slate-300">
              <span>When was that?</span>
              <input
                name="lastServiceWhen"
                value={form.lastServiceWhen}
                onChange={(e) => setForm((prev) => ({ ...prev, lastServiceWhen: e.target.value }))}
                placeholder="Month/year or date"
                className="rounded-md border px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <label className="grid gap-1 text-xs text-slate-300">
              <span>Are you in good standing?</span>
              <select
                name="iasStatus"
                value={form.iasStatus}
                onChange={(e) => setForm((prev) => ({ ...prev, iasStatus: e.target.value }))}
                className="rounded-md border px-2 py-1.5 text-sm"
              >
                <option value="">Select one</option>
                <option value="YES">Yes</option>
                <option value="NO">No</option>
                <option value="UNSURE">Unsure / prefer not to say</option>
              </select>
            </label>
            <input name="iasNumber" value={form.iasNumber} onChange={(e) => setForm((prev) => ({ ...prev, iasNumber: e.target.value }))} placeholder="IAS Number (optional)" className="rounded-md border px-2 py-1.5 text-sm" />
          </div>
          <div className="grid gap-1">
            <span className="text-xs text-slate-300">Starting tier</span>
            <input value="FREE" readOnly className="rounded-md border px-2 py-1.5 text-sm text-slate-400" />
            <input type="hidden" name="subscriptionTier" value="FREE" />
          </div>
          <label className="flex items-start gap-2 rounded-md border border-[var(--border)] p-3 text-sm text-slate-200">
            <input
              name="acceptedTerms"
              type="checkbox"
              checked={form.acceptedTerms}
              onChange={(e) => setForm((prev) => ({ ...prev, acceptedTerms: e.target.checked }))}
              className="mt-1"
              required
            />
            <span>
              I agree to the current terms, privacy policy, and community rules. Version {CURRENT_TERMS_VERSION}.
            </span>
          </label>
          <p className="pt-1 text-xs text-slate-300">Interests: pick your top 5 (most important first):</p>
          {[1, 2, 3, 4, 5].map((rank) => (
            <label key={rank} className="flex items-center gap-2 text-xs">
              <span className="w-12 text-slate-300">Rank {rank}</span>
              <select
                name={`interest${rank}`}
                value={form[`interest${rank}` as "interest1" | "interest2" | "interest3" | "interest4" | "interest5"]}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    [`interest${rank}`]: e.target.value,
                  }) as typeof prev)
                }
                required
                className="w-full rounded-md border px-2 py-1.5 text-sm"
              >
                <option value="">Select interest</option>
                {INTEREST_OPTIONS.map((opt) => (
                  <option key={`${rank}-${opt}`} value={opt}>{opt}</option>
                ))}
              </select>
            </label>
          ))}
          <input
            type="text"
            autoComplete="off"
            tabIndex={-1}
            value={form.website}
            onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))}
            className="absolute left-[-9999px] top-[-9999px] h-0 w-0 opacity-0"
            aria-hidden="true"
          />
          {turnstileSiteKey ? (
            <div className="mt-1 flex justify-center">
              <div className="cf-turnstile" data-sitekey={turnstileSiteKey} data-callback="onTurnstileSuccess" data-expired-callback="onTurnstileExpired" />
            </div>
          ) : null}
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <button type="submit" className="w-full rounded-md border border-[var(--border)] bg-[#8f7228] px-3 py-1.5 text-sm text-black">Create account</button>
        </form>
      </div>
      {turnstileSiteKey ? <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" /> : null}
    </main>
  );
}
