"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { AdminObjectLookupResult } from "@/modules/admin-moderation/object-lookup.service";

export function AdminObjectLookup() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminObjectLookupResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();

    if (!trimmed) {
      setResults([]);
      setStatus("idle");
      setMessage("");
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch(`/api/admin/object-lookup?q=${encodeURIComponent(trimmed)}`, { cache: "no-store" });
      const payload = (await response.json()) as { results?: AdminObjectLookupResult[]; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Lookup failed.");
      }

      setResults(payload.results ?? []);
      setStatus("done");
      setMessage((payload.results ?? []).length ? "" : "No exact ID match found.");
    } catch (error) {
      setResults([]);
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Lookup failed.");
    }
  }

  return (
    <section className="module-card admin-action-panel rounded-md p-6">
      <div>
        <p className="eyebrow">Admin Lookup</p>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--text)]">Object ID Lookup</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
          Paste an exact database ID shown on an admin-visible post, listing, ad, chat, mail item, media asset, group thread, or report.
        </p>
      </div>

      <form className="admin-object-lookup-form" onSubmit={search}>
        <label className="form-field">
          <span>Database ID</span>
          <input
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Paste object ID"
            value={query}
          />
        </label>
        <button className="btn-primary" disabled={status === "loading"} type="submit">
          {status === "loading" ? "Searching" : "Search"}
        </button>
      </form>

      {message ? <p className={status === "error" ? "form-error" : "text-sm text-[var(--muted)]"}>{message}</p> : null}

      {results.length > 0 ? (
        <div className="admin-object-results">
          {results.map((result) => (
            <article className="admin-object-result" key={`${result.kind}-${result.id}`}>
              <div>
                <p className="eyebrow">{result.kind}</p>
                <h2>{result.title}</h2>
                <p>{result.detail}</p>
                <code>{result.id}</code>
                {result.createdAt ? <p>Created {new Date(result.createdAt).toLocaleString()}</p> : null}
              </div>
              {result.href ? (
                <a className="btn-secondary" href={result.href}>
                  Open
                </a>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
