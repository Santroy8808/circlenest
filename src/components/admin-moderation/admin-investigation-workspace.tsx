"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useTransition } from "react";

type AccountResult = {
  id: string;
  username: string;
  email: string;
  displayName: string;
  tierName: string;
};

type InvestigationReport = {
  overallAssessment?: string;
  riskLevel?: string;
  recommendedAction?: string;
  patterns?: Array<{ label?: string; explanation?: string; confidence?: number; evidencePostIds?: string[] }>;
  limitations?: string[];
};

type InvestigationWorkspace = {
  subject: AccountResult & { profile?: { avatarUrl?: string | null } | null };
  activeFlagCount: number;
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
  posts: Array<{
    id: string;
    body: string;
    visibility: string;
    createdAt: string;
    permalink: string;
    mediaAsset?: { publicUrl?: string | null; mimeType?: string | null } | null;
    tags: string[];
    activeFlag?: { reason: string; flaggedAt: string; expiresAt: string } | null;
  }>;
  investigations: Array<{
    id: string;
    reference: string;
    status: string;
    triggerReason: string;
    summary?: string | null;
    report?: InvestigationReport | null;
    sourcePostIds: string[];
    createdAt: string;
    completedAt?: string | null;
    error?: string | null;
  }>;
};

export function AdminInvestigationWorkspace() {
  const [accountQuery, setAccountQuery] = useState("");
  const [accountResults, setAccountResults] = useState<AccountResult[]>([]);
  const [selected, setSelected] = useState<AccountResult | null>(null);
  const [workspace, setWorkspace] = useState<InvestigationWorkspace | null>(null);
  const [contentQuery, setContentQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [tag, setTag] = useState("");
  const [page, setPage] = useState(1);
  const [searchingAccounts, setSearchingAccounts] = useState(false);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const query = accountQuery.trim();
    if (selected && query.toLowerCase() === selected.username.toLowerCase()) return;
    if (query.length < 2) {
      setAccountResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchingAccounts(true);
      const response = await fetch(`/api/admin/status-change?query=${encodeURIComponent(query)}`, { cache: "no-store", signal: controller.signal });
      const payload = (await response.json().catch(() => null)) as { accounts?: AccountResult[]; error?: string } | null;
      if (!controller.signal.aborted) {
        setAccountResults(response.ok ? payload?.accounts ?? [] : []);
        setMessage(response.ok ? "" : payload?.error ?? "Account search failed.");
        setSearchingAccounts(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [accountQuery, selected]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoadingPosts(true);
      const params = new URLSearchParams({ subjectUserId: selected.id, page: String(page), pageSize: "30" });
      if (contentQuery.trim()) params.set("query", contentQuery.trim());
      if (dateFrom) params.set("dateFrom", `${dateFrom}T00:00:00.000Z`);
      if (dateTo) params.set("dateTo", `${dateTo}T23:59:59.999Z`);
      if (tag.trim()) params.append("tag", tag.trim());
      const response = await fetch(`/api/admin/investigations?${params}`, { cache: "no-store", signal: controller.signal });
      const payload = (await response.json().catch(() => null)) as { workspace?: InvestigationWorkspace; error?: string } | null;
      if (!controller.signal.aborted) {
        setWorkspace(response.ok ? payload?.workspace ?? null : null);
        setMessage(response.ok ? "" : payload?.error ?? "Investigation search failed.");
        setLoadingPosts(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [contentQuery, dateFrom, dateTo, page, selected, tag]);

  function selectAccount(account: AccountResult) {
    setSelected(account);
    setAccountQuery(account.username);
    setAccountResults([]);
    setWorkspace(null);
    setContentQuery("");
    setDateFrom("");
    setDateTo("");
    setTag("");
    setPage(1);
  }

  function runInvestigation() {
    if (!selected) return;
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/admin/investigations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectUserId: selected.id })
      });
      const payload = (await response.json().catch(() => null)) as { investigation?: { reference?: string }; replayed?: boolean; error?: string } | null;
      if (!response.ok) {
        setMessage(payload?.error ?? "Could not start the investigation.");
        return;
      }
      setMessage(payload?.replayed ? "An investigation is already queued or running." : `Investigation ${payload?.investigation?.reference ?? ""} queued.`);
    });
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Admin tools</p>
        <h1 className="mt-3 text-3xl font-semibold">Investigation</h1>
        <p className="mt-3 max-w-4xl leading-7 text-[var(--muted)]">
          Review a member&apos;s stream posts, dates, tags, active flags, and source-linked reports. Private messages are never included.
        </p>
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">1. Find account</h2>
        <label className="mt-4 grid gap-2">
          <span className="form-label">Name, username, or email</span>
          <input
            aria-autocomplete="list"
            autoComplete="off"
            className="form-field"
            onChange={(event) => {
              setAccountQuery(event.target.value);
              if (selected && event.target.value.trim().toLowerCase() !== selected.username.toLowerCase()) setSelected(null);
            }}
            placeholder="Start typing any part of the account name"
            value={accountQuery}
          />
        </label>
        {accountQuery.trim().length >= 2 && !selected ? (
          <div className="mt-2 rounded-md border border-[var(--line)] p-2" role="listbox">
            <p aria-live="polite" className="px-2 py-1 text-sm text-[var(--muted)]">
              {searchingAccounts ? "Searching..." : `${accountResults.length} ${accountResults.length === 1 ? "account" : "accounts"} found`}
            </p>
            {!searchingAccounts && accountResults.length === 0 ? <p className="px-2 py-3 text-sm">No matching accounts.</p> : null}
            {accountResults.map((account) => (
              <button aria-selected={false} className="mt-1 flex w-full items-center justify-between gap-3 rounded-md px-3 py-3 text-left hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--gold)]" key={account.id} onClick={() => selectAccount(account)} role="option" type="button">
                <span className="min-w-0"><strong className="block truncate">{account.displayName}</strong><span className="block truncate text-sm text-[var(--muted)]">@{account.username} · {account.email}</span></span>
                <span className="pill shrink-0 rounded-full px-3 py-1 text-xs">{account.tierName}</span>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {selected ? (
        <>
          <section className="surface rounded-md p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><h2 className="text-2xl font-semibold">{selected.displayName}</h2><p className="mt-1 text-[var(--muted)]">@{selected.username} · {selected.email}</p></div>
              <button className="btn-secondary" disabled={isPending} onClick={runInvestigation} type="button">{isPending ? "Queuing..." : "Run investigation"}</button>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <label className="grid gap-2 md:col-span-2"><span className="form-label">Post text or tag</span><input className="form-field" onChange={(event) => { setContentQuery(event.target.value); setPage(1); }} placeholder="Search automatically" value={contentQuery} /></label>
              <label className="grid gap-2"><span className="form-label">From date</span><input className="form-field" onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} type="date" value={dateFrom} /></label>
              <label className="grid gap-2"><span className="form-label">Through date</span><input className="form-field" onChange={(event) => { setDateTo(event.target.value); setPage(1); }} type="date" value={dateTo} /></label>
              <label className="grid gap-2 md:col-span-2"><span className="form-label">Exact tag</span><input className="form-field" onChange={(event) => { setTag(event.target.value); setPage(1); }} placeholder="#tag" value={tag} /></label>
            </div>
            {message ? <p aria-live="polite" className="mt-4 text-sm text-[var(--muted)]">{message}</p> : null}
          </section>

          <section className="surface rounded-md p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-2xl font-semibold text-[var(--gold)]">Post stream</h2><p className="mt-1 text-sm text-[var(--muted)]">{loadingPosts ? "Searching..." : `${workspace?.pagination.total ?? 0} matching posts · ${workspace?.activeFlagCount ?? 0} active flags`}</p></div>
            </div>
            <div className="mt-4 grid gap-4">
              {!loadingPosts && workspace?.posts.length === 0 ? <p className="rounded-md border border-[var(--line)] p-5">No posts match these filters.</p> : null}
              {workspace?.posts.map((post) => (
                <article className={`rounded-md border p-4 ${post.activeFlag ? "border-red-400 bg-red-950/10" : "border-[var(--line)]"}`} id={`investigation-post-${post.id}`} key={post.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--muted)]"><span>{new Date(post.createdAt).toLocaleString()} · {post.visibility}</span><Link className="font-semibold text-[var(--gold)] hover:underline" href={post.permalink}>Open source post</Link></div>
                  <p className="mt-3 whitespace-pre-wrap break-words leading-7">{post.body || "Picture post"}</p>
                  {post.mediaAsset?.publicUrl && post.mediaAsset.mimeType?.startsWith("image/") ? <Image alt="Post attachment" className="mt-3 max-h-80 w-auto max-w-full rounded-md object-contain" height={480} src={post.mediaAsset.publicUrl} unoptimized width={640} /> : null}
                  {post.tags.length ? <p className="mt-3 text-sm text-[var(--gold)]">{post.tags.map((value) => `#${value}`).join(" ")}</p> : null}
                  {post.activeFlag ? <div className="mt-4 rounded-md border border-red-400/60 bg-red-950/20 p-3 text-sm"><strong className="text-red-200">Active admin flag</strong><p className="mt-1">{post.activeFlag.reason}</p><p className="mt-1 text-red-100/70">Expires {new Date(post.activeFlag.expiresAt).toLocaleString()}</p></div> : null}
                </article>
              ))}
            </div>
            {workspace && workspace.pagination.pageCount > 1 ? <div className="mt-5 flex items-center justify-between gap-3"><button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">Previous</button><span className="text-sm">Page {page} of {workspace.pagination.pageCount}</span><button className="btn-secondary" disabled={page >= workspace.pagination.pageCount} onClick={() => setPage((value) => value + 1)} type="button">Next</button></div> : null}
          </section>

          <section className="surface rounded-md p-5">
            <h2 className="text-2xl font-semibold text-[var(--gold)]">Investigation reports</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">Reports package their sources and link each cited post. Flags are leads, not findings.</p>
            <div className="mt-4 grid gap-4">
              {workspace?.investigations.length === 0 ? <p>No investigations recorded for this account.</p> : null}
              {workspace?.investigations.map((investigation) => {
                const report = investigation.report && typeof investigation.report === "object" ? investigation.report : null;
                return <article className="rounded-md border border-[var(--line)] p-4" key={investigation.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-semibold">{investigation.reference}</h3><span className="pill rounded-full px-3 py-1 text-xs">{investigation.status.replaceAll("_", " ")}</span></div>
                  <p className="mt-2 text-sm text-[var(--muted)]">{investigation.triggerReason} · {new Date(investigation.createdAt).toLocaleString()}</p>
                  <p className="mt-3 leading-7">{report?.overallAssessment ?? investigation.summary ?? investigation.error ?? "Report is queued."}</p>
                  {report ? <p className="mt-2 text-sm"><strong>Risk:</strong> {report.riskLevel ?? "Not assigned"} · <strong>Recommendation:</strong> {report.recommendedAction?.replaceAll("_", " ") ?? "Human review"}</p> : null}
                  {report?.patterns?.map((pattern, index) => <div className="mt-4 rounded-md border border-[var(--line)] p-3" key={`${investigation.id}-${index}`}><strong className="text-[var(--gold)]">{pattern.label ?? "Observed pattern"}</strong><p className="mt-1 text-sm leading-6">{pattern.explanation}</p><div className="mt-2 flex flex-wrap gap-2">{pattern.evidencePostIds?.map((postId) => <Link className="text-sm font-semibold text-[var(--gold)] hover:underline" href={`/posts/${postId}`} key={postId}>Source {postId.slice(0, 8)}</Link>)}</div></div>)}
                  {!report && investigation.sourcePostIds.length ? <div className="mt-3 flex flex-wrap gap-2">{investigation.sourcePostIds.slice(0, 20).map((postId) => <Link className="text-sm font-semibold text-[var(--gold)] hover:underline" href={`/posts/${postId}`} key={postId}>Source {postId.slice(0, 8)}</Link>)}</div> : null}
                </article>;
              })}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
