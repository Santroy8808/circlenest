"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TierPolicy } from "@/lib/policy/tier-policy";

type TierOnboardingCardProps = {
  userId: string;
  policy: TierPolicy;
  showAdminFeatures?: boolean;
  displayName: string | null;
  accountAgeDays: number;
};

const NEW_MEMBER_WINDOW_DAYS = 14;
const STORAGE_PREFIX = "theta.onboarding.dismissed.";

function formatTierName(policy: TierPolicy) {
  if (policy.isAdmin) return "Admin";
  if (policy.tier === "AUDITOR") return "Auditor";
  if (policy.tier === "PLUS") return "Activist";
  if (policy.tier === "PRO") return "Biz";
  return "Free";
}

export function TierOnboardingCard({ userId, policy, showAdminFeatures = true, displayName, accountAgeDays }: TierOnboardingCardProps) {
  const [dismissed, setDismissed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(`${STORAGE_PREFIX}${userId}`) === "1");
    } catch {
      setDismissed(false);
    }
    setReady(true);
  }, [userId]);

  if (!ready) return null;
  if (accountAgeDays > NEW_MEMBER_WINDOW_DAYS) return null;
  if (dismissed) return null;
  if (policy.isAdmin && !showAdminFeatures) return null;

  const name = displayName?.trim() || "there";
  const tierName = formatTierName(policy);
  const quickActions =
    policy.tier === "FREE"
      ? [
          { href: "/home", label: "Create a post" },
          { href: "/groups", label: "Join groups" },
          { href: "/friends", label: "Find people" },
        ]
      : policy.tier === "PLUS"
        ? [
            { href: "/production-zone/events", label: "Create an event" },
            { href: "/production-zone/market", label: "Create a listing" },
            { href: "/production-zone/fundraisers", label: "Start a fund raiser" },
          ]
        : policy.tier === "PRO"
          ? [
              { href: "/production-zone/business-profile", label: "Open business profile" },
              { href: "/profile/gallery", label: "Open My Pics" },
              { href: "/production-zone/business/storefront", label: "Open storefront" },
            ]
          : policy.tier === "AUDITOR"
            ? [
                { href: "/auditors/im-an-auditor", label: "Open auditor profile" },
                { href: "/production-zone/business-profile", label: "Open business profile" },
                { href: "/production-zone/events", label: "Create an event" },
              ]
            : [
                { href: "/admin", label: "Open admin portal" },
                { href: "/moderation", label: "Open moderation" },
                { href: "/settings/account", label: "Review account tools" },
              ];

  const guidance =
    policy.tier === "FREE"
      ? [
          "Free lets you browse the stream, join groups, and message friends.",
          "Free cannot create events, Market listings, fund raisers, or hiring posts.",
          "Open Compare memberships to see what Activist and Biz add.",
        ]
      : policy.tier === "PLUS"
        ? [
            "You can create events, Market listings, and fund raisers.",
            "Open Compare memberships to see Biz, Auditor, and ad tools.",
            "Activist keeps feed controls and moderation tools open.",
          ]
      : policy.tier === "PRO"
        ? [
            "You can create hiring posts, fund raisers, advertise, and track monthly ad credits.",
            "Use Settings for billing and plan details.",
            "Production tools stay open for business workflows.",
          ]
      : policy.tier === "AUDITOR"
        ? [
              "You can create hiring posts, fund raisers, advertise, and track boosted ad credits.",
              "Auditor access is for active auditors with current ABLE membership.",
              "Use your profile and Scientology details to support your auditor listing.",
            ]
          : [
              "Admin access is separate from paid membership.",
              "Open Admin Portal for member tiers, moderation, and reports.",
              "Use secure-area unlock before sensitive admin actions.",
            ];

  const primaryHref = policy.tier === "FREE" ? "/membership" : policy.tier === "ADMIN" ? "/admin" : "/settings/subscription";
  const primaryLabel = policy.tier === "FREE" ? "Compare memberships" : policy.tier === "ADMIN" ? "Open admin portal" : "Open subscription";
  const secondaryHref =
    policy.tier === "FREE"
      ? "/settings/subscription"
      : policy.tier === "PLUS"
        ? "/fundraisers"
        : policy.tier === "PRO" || policy.tier === "AUDITOR"
          ? "/fundraisers"
          : "/moderation";
  const secondaryLabel =
    policy.tier === "FREE"
      ? "Open settings"
      : policy.tier === "PLUS"
        ? "Create a fund raiser"
        : policy.tier === "PRO"
          ? "Open fund raisers"
          : policy.tier === "AUDITOR"
            ? "Open fund raisers"
          : "Open moderation";

  return (
    <section className="card border border-amber-400/20 bg-[linear-gradient(180deg,rgba(143,114,40,0.12),rgba(8,11,16,0.96))] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="inline-flex rounded-full border border-amber-400/30 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100">
            New member
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-strong)]">Welcome, {name}</h2>
            <p className="text-sm text-slate-300">
              Your current plan is {tierName}. Here’s the fastest way to get rolling.
            </p>
          </div>
        </div>
        <div className="rounded border border-[var(--border)] px-3 py-2 text-xs text-slate-300">
          Account age: {accountAgeDays} day{accountAgeDays === 1 ? "" : "s"}
        </div>
      </div>

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          className="rounded border border-[var(--border)] px-2 py-1 text-xs text-slate-300"
          onClick={() => {
            try {
              window.localStorage.setItem(`${STORAGE_PREFIX}${userId}`, "1");
            } catch {}
            setDismissed(true);
          }}
        >
          Dismiss
        </button>
      </div>

      <ul className="mt-3 grid gap-2 text-sm text-slate-200 md:grid-cols-3">
        {guidance.map((item) => (
          <li key={item} className="rounded border border-[var(--border)] bg-black/10 px-3 py-2">
            {item}
          </li>
        ))}
      </ul>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {quickActions.map((action) => (
          <Link key={action.href} href={action.href} className="rounded border border-[var(--border)] bg-[#111827] px-3 py-2 text-sm text-[var(--text-strong)] transition hover:border-[var(--accent)]/40 hover:bg-[#142033]">
            {action.label}
          </Link>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={primaryHref} className="rounded border border-amber-300/40 bg-[#8f7228] px-3 py-2 text-sm font-semibold text-black">
          {primaryLabel}
        </Link>
        <Link href={secondaryHref} className="rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-strong)]">
          {secondaryLabel}
        </Link>
      </div>
    </section>
  );
}
