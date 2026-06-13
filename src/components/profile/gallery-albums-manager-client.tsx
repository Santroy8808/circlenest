"use client";

import { useMemo, useState } from "react";

type AlbumTag = { tag: { id: string; name: string } };

type GalleryAlbum = {
  id: string;
  title: string;
  visibility?: string;
  parentAlbumId?: string | null;
  createdAt: string | Date;
  photos: { id: string; url: string; createdAt: string | Date }[];
  albumTags?: AlbumTag[];
};

function parseAlbumTagNames(album: GalleryAlbum | null | undefined): string[] {
  return album?.albumTags?.map((entry) => entry.tag.name) ?? [];
}

export function GalleryAlbumsManagerClient({
  initialAlbums,
  initialUserTags,
}: {
  initialAlbums: GalleryAlbum[];
  initialUserTags: string[];
}) {
  const shellCardClass = "rounded-[18px] border border-[var(--border)] bg-[#0f1523] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.18)]";
  const inputClass = "rounded-[10px] border border-[#304058] bg-[#182232] px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-[var(--accent)]/50";
  const ghostButtonClass = "rounded-full border border-[#304058] px-4 py-2 text-sm text-slate-200 transition hover:border-[#4a5a78] hover:text-white";
  const primaryButtonClass = "rounded-full bg-[#376ef8] px-4 py-2 text-sm font-semibold text-white transition hover:translate-y-[-1px] hover:shadow-[0_10px_24px_rgba(55,110,248,0.28)]";
  const [albums, setAlbums] = useState(initialAlbums);
  const [selectedAlbumId, setSelectedAlbumId] = useState(initialAlbums[0]?.id ?? "");
  const [newAlbumTitle, setNewAlbumTitle] = useState("");
  const [newAlbumParentId, setNewAlbumParentId] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [userTags, setUserTags] = useState(initialUserTags);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedAlbum = useMemo(
    () => albums.find((album) => album.id === selectedAlbumId) ?? albums[0] ?? null,
    [albums, selectedAlbumId],
  );
  const [albumTagNames, setAlbumTagNames] = useState<string[]>(parseAlbumTagNames(initialAlbums[0]));

  function syncAlbum(nextAlbum: GalleryAlbum) {
    setAlbums((previous) => previous.map((album) => (album.id === nextAlbum.id ? nextAlbum : album)));
    if (nextAlbum.id === selectedAlbumId) {
      setAlbumTagNames(parseAlbumTagNames(nextAlbum));
    }
  }

  async function createAlbum() {
    const title = newAlbumTitle.trim();
    if (!title || busy) return;
    setBusy(true);
    setStatus("");
    const res = await fetch("/api/gallery/albums", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        parentAlbumId: newAlbumParentId || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setStatus(body?.error ?? "Could not create album.");
      return;
    }
    const created = (await res.json()) as GalleryAlbum;
    setAlbums((previous) => [created, ...previous]);
    setSelectedAlbumId(created.id);
    setAlbumTagNames(parseAlbumTagNames(created));
    setNewAlbumTitle("");
    setNewAlbumParentId("");
    setStatus(`Album "${created.title}" created.`);
  }

  async function saveAlbumTags() {
    if (!selectedAlbum || busy) return;
    setBusy(true);
    setStatus("");
    const res = await fetch("/api/gallery/albums", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        albumId: selectedAlbum.id,
        tagNames: albumTagNames,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setStatus(body?.error ?? "Could not save album tags.");
      return;
    }
    const updated = (await res.json()) as GalleryAlbum;
    syncAlbum(updated);
    setUserTags((previous) => Array.from(new Set([...previous, ...albumTagNames])).sort((a, b) => a.localeCompare(b)));
    setStatus("Album tags saved.");
  }

  function addTag(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setAlbumTagNames((previous) => (previous.includes(trimmed) ? previous : [...previous, trimmed]));
    setUserTags((previous) => Array.from(new Set([...previous, trimmed])).sort((a, b) => a.localeCompare(b)));
  }

  function removeTag(name: string) {
    setAlbumTagNames((previous) => previous.filter((entry) => entry !== name));
  }

  return (
    <section className="space-y-4">
      <article className={shellCardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-strong)]">Albums</h1>
            <p className="text-sm text-slate-400">Create parent albums and keep album-level tags here, away from My Pics.</p>
          </div>
        </div>
      </article>

      <article className={shellCardClass}>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-strong)]">Create album</p>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto]">
          <input
            value={newAlbumTitle}
            onChange={(event) => setNewAlbumTitle(event.target.value)}
            placeholder="Album name"
            className={inputClass}
          />
          <select value={newAlbumParentId} onChange={(event) => setNewAlbumParentId(event.target.value)} className={inputClass}>
            <option value="">No parent album</option>
            {albums.map((album) => (
              <option key={album.id} value={album.id}>
                {album.title}
              </option>
            ))}
          </select>
          <button type="button" className={primaryButtonClass} onClick={() => void createAlbum()} disabled={busy}>
            Create album
          </button>
        </div>
      </article>

      <article className={shellCardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-strong)]">Album tags</p>
          {albums.length ? (
            <select value={selectedAlbum?.id ?? ""} onChange={(event) => {
              const next = albums.find((album) => album.id === event.target.value) ?? null;
              setSelectedAlbumId(event.target.value);
              setAlbumTagNames(parseAlbumTagNames(next));
            }} className={inputClass}>
              {albums.map((album) => (
                <option key={album.id} value={album.id}>
                  {album.title}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {selectedAlbum ? (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              {albumTagNames.length ? (
                albumTagNames.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="rounded-full border border-[#304058] bg-[#0f1624] px-3 py-1 text-xs text-slate-200"
                    onClick={() => removeTag(tag)}
                  >
                    {tag} x
                  </button>
                ))
              ) : (
                <p className="text-xs text-slate-400">No album tags yet.</p>
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input
                value={newTagName}
                onChange={(event) => setNewTagName(event.target.value)}
                placeholder="Add album tag"
                className={`${inputClass} min-w-[180px]`}
              />
              <button
                type="button"
                className={ghostButtonClass}
                onClick={() => {
                  addTag(newTagName);
                  setNewTagName("");
                }}
              >
                Add tag
              </button>
              {userTags.length ? (
                <select
                  defaultValue=""
                  className={inputClass}
                  onChange={(event) => {
                    if (!event.target.value) return;
                    addTag(event.target.value);
                    event.target.value = "";
                  }}
                >
                  <option value="">Use existing tag</option>
                  {userTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              ) : null}
              <button type="button" className={primaryButtonClass} onClick={() => void saveAlbumTags()} disabled={busy}>
                Save album tags
              </button>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-slate-400">No albums yet.</p>
        )}
      </article>

      {status ? <p className="text-sm text-slate-300">{status}</p> : null}
    </section>
  );
}
