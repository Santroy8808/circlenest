"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { BusinessProfileSummary } from "@/lib/business/business-profile";
import type { BusinessStorefrontInquirySummary } from "@/lib/business/storefront";

type Props = {
  ownProfile: BusinessProfileSummary | null;
  inquiries: BusinessStorefrontInquirySummary[];
};

const inputClassName =
  "w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100";

export function BusinessStorefrontManager({ ownProfile, inquiries }: Props) {
  const router = useRouter();
  const [storefrontSlug, setStorefrontSlug] = useState(ownProfile?.storefrontSlug ?? "");
  const [storefrontEnabled, setStorefrontEnabled] = useState(ownProfile?.storefrontEnabled ?? false);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const publicPath = useMemo(() => {
    const slug = storefrontSlug.trim() || ownProfile?.storefrontSlug?.trim() || "";
    return slug ? `/storefront/${slug}` : null;
  }, [ownProfile?.storefrontSlug, storefrontSlug]);

  async function saveStorefront() {
    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch("/api/business-profiles/storefront", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storefrontSlug: storefrontSlug.trim() || null,
          storefrontEnabled,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setStatus(payload.error ?? "Could not save storefront settings.");
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-4 p-4">
        <div>
          <h2 className="text-lg font-semibold">Storefront</h2>
          <p className="text-sm text-slate-400">
            Publish a public storefront that non-members can view and contact.
          </p>
        </div>

        {ownProfile ? (
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Public path</span>
              <div className="flex items-center gap-2">
                <span className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-400">/storefront/</span>
                <input
                  value={storefrontSlug}
                  onChange={(event) => setStorefrontSlug(event.target.value)}
                  placeholder="your-storefront"
                  className={inputClassName}
                />
              </div>
            </label>
            <label className="flex items-center gap-2 rounded border border-slate-300 px-3 py-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={storefrontEnabled}
                onChange={(event) => setStorefrontEnabled(event.target.checked)}
              />
              Enable public storefront
            </label>
          </div>
        ) : (
          <p className="rounded border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
            Create your business profile first before enabling a storefront.
          </p>
        )}

        {publicPath ? (
          <div className="rounded border border-[var(--border)] bg-[color:var(--card-alt)] p-3 text-sm text-slate-300">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Public URL</p>
            {ownProfile?.storefrontEnabled ? (
              <Link href={publicPath} className="mt-1 block break-all text-amber-200 underline underline-offset-2">
                {publicPath}
              </Link>
            ) : (
              <p className="mt-1 break-all text-slate-300">{publicPath}</p>
            )}
            {!ownProfile?.storefrontEnabled ? (
              <p className="mt-1 text-xs text-slate-500">Enable the storefront to make this live.</p>
            ) : null}
          </div>
        ) : null}

        <button
          type="button"
          disabled={!ownProfile || saving}
          onClick={() => void saveStorefront()}
          className="rounded bg-[#8f7228] px-3 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save storefront"}
        </button>
        {status ? <p className="text-sm text-slate-400">{status}</p> : null}
      </section>

      <section className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Storefront inquiries</h2>
            <p className="text-sm text-slate-400">Messages from external visitors and non-members.</p>
          </div>
          {ownProfile?.storefrontEnabled && ownProfile?.storefrontSlug ? (
            <Link href={`/storefront/${ownProfile.storefrontSlug}`} className="rounded border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-[color:var(--card-alt)]">
              Preview storefront
            </Link>
          ) : null}
        </div>

        <div className="space-y-2">
          {inquiries.length ? (
            inquiries.map((inquiry) => (
              <article key={inquiry.id} className="rounded border border-[var(--border)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-100">{inquiry.visitorName}</p>
                    <p className="text-xs text-slate-400">{inquiry.visitorEmail}</p>
                  </div>
                  <span className="rounded-full border border-slate-400/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                    {inquiry.readAt ? "Read" : "Unread"}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{inquiry.visitorMessage}</p>
                <p className="mt-2 text-[11px] text-slate-500">{new Date(inquiry.createdAt).toLocaleString()}</p>
              </article>
            ))
          ) : (
            <p className="text-sm text-slate-500">No inquiries yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
