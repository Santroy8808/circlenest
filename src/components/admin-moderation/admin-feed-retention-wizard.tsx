"use client";

import { useEffect, useState, useTransition } from "react";

type AdminFeedSearchResult = {
  id: string;
  bodyPreview: string;
  author: string;
  authorUsername: string;
  createdAt: string;
  visibility: string;
  mediaAssetId: string | null;
  streamCompressedAt: string | null;
  streamArchivedAt: string | null;
  streamDeletedAt: string | null;
  adminHoldAt: string | null;
  adminHoldReason: string | null;
  adminHoldThread: boolean;
};

type SearchPayload = {
  ok?: boolean;
  error?: string;
  results?: AdminFeedSearchResult[];
};

function dateLabel(value?: string | null) {
  if (!value) return "No";
  return new Date(value).toLocaleString();
}

function downloadJson(fileName: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AdminFeedRetentionWizard() {
  const [query, setQuery] = useState("");
  const [heldOnly, setHeldOnly] = useState(false);
  const [results, setResults] = useState<AdminFeedSearchResult[]>([]);
  const [selectedPostId, setSelectedPostId] = useState("");
  const [holdReason, setHoldReason] = useState("Admin retention hold.");
  const [holdThread, setHoldThread] = useState(true);
  const [importJson, setImportJson] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function search() {
    setError("");
    setMessage("");
    startTransition(async () => {
      const params = new URLSearchParams({
        query,
        heldOnly: String(heldOnly),
        includeArchived: "true",
        includeDeleted: "true",
        limit: "30"
      });
      const response = await fetch(`/api/admin/feed-retention?${params}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as SearchPayload | null;
      if (!response.ok || !payload?.results) {
        setError(payload?.error ?? "Could not search stream posts.");
        return;
      }
      setResults(payload.results);
      setMessage(`Found ${payload.results.length} post${payload.results.length === 1 ? "" : "s"}.`);
    });
  }

  function postAction(action: string, payload?: unknown) {
    setError("");
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/admin/feed-retention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload })
      });
      const result = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok || !result?.ok) {
        setError(typeof result?.error === "string" ? result.error : "Action failed.");
        return;
      }

      if (action === "export-thread") {
        downloadJson(`theta-space-thread-${selectedPostId}.json`, result.thread);
        setMessage("Thread exported.");
        return;
      }

      if (action === "apply-policy") {
        setMessage(
          `Policy applied. Compressed: ${result.compressedCount ?? 0}. Skipped: ${result.compressionSkippedCount ?? 0}. Failed: ${result.compressionFailedCount ?? 0}. Archived: ${result.archivedCount ?? 0}. Permanently deleted: ${result.permanentlyDeletedCount ?? result.deletedCount ?? 0}.`
        );
        search();
        return;
      }

      if (action === "import-thread") {
        setImportJson("");
        setMessage(`Thread imported: ${String(result.postId ?? "")}`);
        search();
        return;
      }

      setMessage(action === "hold-post" ? "Post/thread placed on admin hold." : "Admin hold released.");
      search();
    });
  }

  function holdSelected() {
    if (!selectedPostId) {
      setError("Select a post first.");
      return;
    }
    if (holdReason.trim().length < 5) {
      setError("Enter a hold reason.");
      return;
    }
    postAction("hold-post", { postId: selectedPostId, reason: holdReason, holdThread });
  }

  function releaseSelected() {
    if (!selectedPostId) {
      setError("Select a post first.");
      return;
    }
    postAction("release-hold", { postId: selectedPostId });
  }

  function exportSelected() {
    if (!selectedPostId) {
      setError("Select a post first.");
      return;
    }
    postAction("export-thread", { postId: selectedPostId });
  }

  function importThread() {
    try {
      postAction("import-thread", JSON.parse(importJson));
    } catch {
      setError("Import JSON is invalid.");
    }
  }

  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Admin Tools</p>
        <h1 className="mt-3 text-3xl font-semibold">Stream Retention</h1>
        <p className="mt-3 max-w-4xl leading-7 text-[var(--muted)]">
          Search stream posts, place indefinite admin holds, export/import full post threads, and run the active stream-retention policy. Held posts are hidden from normal users and remain visible to admins with a red outline.
        </p>
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">1. Search stream posts</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <input className="form-field" onChange={(event) => setQuery(event.target.value)} placeholder="post id, text, author, username, or email" value={query} />
          <button className="btn-secondary" disabled={isPending} onClick={search} type="button">
            Search
          </button>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-[var(--muted)]">
          <input checked={heldOnly} onChange={(event) => setHeldOnly(event.target.checked)} type="checkbox" />
          Held posts only
        </label>
      </section>

      <section className="surface rounded-md p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">2. Results</h2>
          <button className="btn-secondary" disabled={isPending} onClick={() => postAction("apply-policy")} type="button">
            Run retention policy now
          </button>
        </div>
        <div className="mt-4 grid gap-3">
          {results.map((post) => (
            <button
              className={`admin-feed-retention-row ${selectedPostId === post.id ? "is-selected" : ""} ${post.adminHoldAt ? "is-held" : ""}`}
              key={post.id}
              onClick={() => setSelectedPostId(post.id)}
              type="button"
            >
              <span>
                <strong>{post.bodyPreview}</strong>
                <small>@{post.authorUsername} - {new Date(post.createdAt).toLocaleString()} - {post.visibility}</small>
              </span>
              <span className="admin-feed-retention-flags">
                {post.mediaAssetId ? <b>Media</b> : null}
                {post.streamCompressedAt ? <b>Compressed</b> : null}
                {post.streamArchivedAt ? <b>Archived</b> : null}
                {post.streamDeletedAt ? <b>Soft-deleted</b> : null}
                {post.adminHoldAt ? <b className="danger">Hold</b> : null}
              </span>
            </button>
          ))}
          {results.length === 0 ? <p className="text-sm text-[var(--muted)]">No posts found.</p> : null}
        </div>
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">3. Hold / export / import</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Selected post: {selectedPostId || "None"}</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="grid gap-3">
            <label className="grid gap-2">
              <span className="form-label">Hold reason</span>
              <textarea className="form-field min-h-24" onChange={(event) => setHoldReason(event.target.value)} value={holdReason} />
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <input checked={holdThread} onChange={(event) => setHoldThread(event.target.checked)} type="checkbox" />
              Hold the full thread and contents
            </label>
            <div className="flex flex-wrap gap-3">
              <button className="btn-primary" disabled={isPending || !selectedPostId} onClick={holdSelected} type="button">
                Place hold
              </button>
              <button className="btn-secondary" disabled={isPending || !selectedPostId} onClick={releaseSelected} type="button">
                Release hold
              </button>
              <button className="btn-secondary" disabled={isPending || !selectedPostId} onClick={exportSelected} type="button">
                Export thread
              </button>
            </div>
          </div>
          <div className="grid gap-3">
            <label className="grid gap-2">
              <span className="form-label">Import exported thread JSON</span>
              <textarea className="form-field min-h-48" onChange={(event) => setImportJson(event.target.value)} placeholder="Paste exported thread JSON here" value={importJson} />
            </label>
            <button className="btn-secondary" disabled={isPending || !importJson.trim()} onClick={importThread} type="button">
              Import thread
            </button>
          </div>
        </div>
        {message ? <p className="mt-4 rounded-md border border-emerald-400/30 bg-emerald-950/25 p-3 text-sm text-emerald-100">{message}</p> : null}
        {error ? <p className="mt-4 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
      </section>

      {selectedPostId ? (
        <section className="surface rounded-md p-5">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">Selected post status</h2>
          {results.filter((post) => post.id === selectedPostId).map((post) => (
            <dl className="admin-feed-retention-status mt-4" key={post.id}>
              <div><dt>Compressed</dt><dd>{dateLabel(post.streamCompressedAt)}</dd></div>
              <div><dt>Archived</dt><dd>{dateLabel(post.streamArchivedAt)}</dd></div>
              <div><dt>Soft-deleted</dt><dd>{dateLabel(post.streamDeletedAt)}</dd></div>
              <div><dt>Admin hold</dt><dd>{dateLabel(post.adminHoldAt)}</dd></div>
              <div><dt>Hold reason</dt><dd>{post.adminHoldReason ?? "None"}</dd></div>
            </dl>
          ))}
        </section>
      ) : null}
    </div>
  );
}
