"use client";

import Link from "next/link";

type TierGateVariant = "locked" | "info";

type TierGateProps = {
  title: string;
  message: string;
  ctaLabel?: string;
  ctaHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  variant?: TierGateVariant;
  compact?: boolean;
};

const VARIANT_STYLES: Record<TierGateVariant, { shell: string; title: string; text: string; button: string; secondary: string }> = {
  locked: {
    shell: "border-amber-400/30 bg-amber-300/10",
    title: "text-amber-100",
    text: "text-amber-50/90",
    button: "border-amber-300/40 bg-amber-300 px-3 py-1.5 text-sm font-semibold text-[#1f1306]",
    secondary: "border-amber-200/30 bg-transparent px-3 py-1.5 text-sm text-amber-100",
  },
  info: {
    shell: "border-sky-400/30 bg-sky-300/10",
    title: "text-sky-100",
    text: "text-sky-50/90",
    button: "border-sky-300/40 bg-sky-200 px-3 py-1.5 text-sm font-semibold text-[#08111e]",
    secondary: "border-sky-200/30 bg-transparent px-3 py-1.5 text-sm text-sky-100",
  },
};

export function TierGate({
  title,
  message,
  ctaLabel,
  ctaHref,
  secondaryLabel,
  secondaryHref,
  variant = "locked",
  compact = false,
}: TierGateProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <section className={`rounded border p-3 ${styles.shell}`}>
      <div className={`grid gap-2 ${compact ? "" : "md:grid-cols-[1fr_auto]"}`}>
        <div className="space-y-1">
          <h3 className={`text-sm font-semibold ${styles.title}`}>{title}</h3>
          <p className={`text-sm ${styles.text}`}>{message}</p>
        </div>
      </div>
      {(ctaHref || secondaryHref) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {ctaHref ? (
            <Link href={ctaHref} className={`rounded border ${styles.button}`}>
              {ctaLabel ?? (variant === "locked" ? "Upgrade to Activist" : "Compare memberships")}
            </Link>
          ) : null}
          {secondaryHref ? (
            <Link href={secondaryHref} className={`rounded border ${styles.secondary}`}>
              {secondaryLabel ?? "Compare memberships"}
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}
