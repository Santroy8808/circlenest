"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { FEED_MODES, type FeedMode } from "@/lib/feed/modes";
import { uploadImageWithCompression } from "@/lib/media/image-upload.client";

const EMOJIS = [
  "\u{1F600}", "\u{1F602}", "\u{1F60D}", "\u{1F44D}", "\u{1F525}", "\u{1F389}",
  "\u{1F64F}", "\u{1F4A1}", "\u{1F60E}", "\u{1F91D}",
] as const;

type Audience = "ALL" | "FRIENDS" | "FAMILY" | "GROUPS";
const VALID_AUDIENCES: readonly Audience[] = ["ALL", "FRIENDS", "FAMILY", "GROUPS"] as const;
const AUDIENCE_OPTIONS: readonly { value: Audience; label: string }[] = [
  { value: "FAMILY", label: "Family" },
  { value: "FRIENDS", label: "Friends" },
  { value: "GROUPS", label: "Groups" },
  { value: "ALL", label: "All" },
] as const;

type ComposerGroup = {
  id: string;
  name: string;
  role?: string;
};

type Comment = {
  id: string;
  content: string;
  parentCommentId?: string | null;
  author: { username: string };
};

type Reaction = { id: string; type: string };

type FeedPost = {
  id: string;
  content: string;
  topic: string | null;
  imageUrl: string | null;
  mediaUrlsJson?: string | null;
  createdAt: string | Date;
  authorId: string;
  author: { username: string };
  comments: Comment[];
  reactions: Reaction[];
  explanation: string;
};

function parseMedia(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function toTitleCase(value: string): string {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function normalizeAudience(value: unknown): Audience | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return (VALID_AUDIENCES as readonly string[]).includes(normalized) ? (normalized as Audience) : null;
}

function buildCommentTree(comments: Comment[]) {
  const byParent: Record<string, Comment[]> = {};
  for (const c of comments) {
    const key = c.parentCommentId ?? "ROOT";
    if (!byParent[key]) byParent[key] = [];
    byParent[key].push(c);
  }
  return { roots: byParent.ROOT ?? [], byParent };
}

async function patchPrefs(payload: Record<string, string | boolean>) {
  await fetch("/api/feed/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function uploadImage(file: File): Promise<string | null> {
  const result = await uploadImageWithCompression(file);
  return result.url;
}

export function FeedClient({
  initialPosts,
  initialMode,
  currentUserId,
  initialHasOlderArchive = false,
  fastWindowDays = 14,
  allowComposer = true,
}: {
  initialPosts: FeedPost[];
  initialMode: FeedMode;
  currentUserId: string;
  initialHasOlderArchive?: boolean;
  fastWindowDays?: number;
  allowComposer?: boolean;
}) {
  const audienceRadioGroupName = `${useId()}-audience`;
  const [posts, setPosts] = useState(initialPosts);
  const [mode, setMode] = useState<FeedMode>(initialMode);
  const [newPost, setNewPost] = useState("");
  const [status, setStatus] = useState("");
  const [openComposer, setOpenComposer] = useState(false);
  const [imageName, setImageName] = useState("");
  const [composerAudience, setComposerAudience] = useState<Audience>("ALL");
  const [composerGroupId, setComposerGroupId] = useState("");
  const [composerGroups, setComposerGroups] = useState<ComposerGroup[]>([]);

  const [replyPostId, setReplyPostId] = useState<string | null>(null);
  const [replyParentByPost, setReplyParentByPost] = useState<Record<string, string | null>>({});
  const [draftByPost, setDraftByPost] = useState<Record<string, string>>({});
  const [commentErrorByPost, setCommentErrorByPost] = useState<Record<string, string>>({});
  const [focusPostId, setFocusPostId] = useState<string | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Record<string, boolean>>({});
  const [hasOlderArchive, setHasOlderArchive] = useState(initialHasOlderArchive);
  const [loadingOlderArchive, setLoadingOlderArchive] = useState(false);
  const [archiveStatus, setArchiveStatus] = useState("");
  const commentInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const modeLabel = useMemo(() => toTitleCase(mode), [mode]);

  useEffect(() => {
    const openFromEvent = () => {
      if (allowComposer) {
        setComposerAudience("ALL");
        setOpenComposer(true);
      }
    };
    window.addEventListener("theta-space:open-communicate", openFromEvent);
    return () => window.removeEventListener("theta-space:open-communicate", openFromEvent);
  }, [allowComposer]);

  useEffect(() => {
    if (!allowComposer) return;
    if (sessionStorage.getItem("theta-space:compose-once") !== "1") return;
    sessionStorage.removeItem("theta-space:compose-once");
    setComposerAudience("ALL");
    setOpenComposer(true);
  }, [allowComposer]);

  useEffect(() => {
    if (!openComposer) return;
    if (!VALID_AUDIENCES.includes(composerAudience)) {
      setComposerAudience("ALL");
    }
  }, [openComposer, composerAudience]);

  useEffect(() => {
    if (!allowComposer) return;
    void (async () => {
      try {
        const res = await fetch("/api/groups", { cache: "no-store" });
        if (!res.ok) return;
        const groups = (await res.json()) as ComposerGroup[];
        if (!Array.isArray(groups)) return;
        setComposerGroups(groups);
        if (groups.length) {
          setComposerGroupId((previous) => previous || groups[0].id);
        }
      } catch {
        // no-op
      }
    })();
  }, [allowComposer]);

  useEffect(() => {
    if (!focusPostId) return;
    const input = commentInputRefs.current[focusPostId];
    if (input) {
      input.focus();
      const len = input.value.length;
      input.setSelectionRange(len, len);
      setFocusPostId(null);
    }
  }, [focusPostId, draftByPost]);

  function insertFormat(prefix: string, suffix = "") {
    const area = document.getElementById("communicate-editor") as HTMLTextAreaElement | null;
    if (!area) {
      setNewPost((v) => `${v}${prefix}${suffix}`);
      return;
    }
    const start = area.selectionStart ?? area.value.length;
    const end = area.selectionEnd ?? area.value.length;
    const selected = area.value.slice(start, end);
    const next = `${area.value.slice(0, start)}${prefix}${selected}${suffix}${area.value.slice(end)}`;
    setNewPost(next);
    requestAnimationFrame(() => {
      area.focus();
      const caret = start + prefix.length + selected.length + suffix.length;
      area.setSelectionRange(caret, caret);
    });
  }

  function openReply(postId: string, parentCommentId: string | null, mention = "") {
    setReplyPostId(postId);
    setReplyParentByPost((prev) => ({ ...prev, [postId]: parentCommentId }));
    setDraftByPost((prev) => ({ ...prev, [postId]: mention || prev[postId] || "" }));
    setCommentErrorByPost((prev) => ({ ...prev, [postId]: "" }));
    setFocusPostId(postId);
  }

  async function loadOlderArchive() {
    if (!hasOlderArchive || loadingOlderArchive) return;
    setLoadingOlderArchive(true);
    setArchiveStatus("Loading older posts...");

    try {
      const oldest = posts.reduce<Date | null>((candidate, post) => {
        const stamp = new Date(post.createdAt).getTime();
        if (Number.isNaN(stamp)) return candidate;
        if (!candidate || stamp < candidate.getTime()) return new Date(stamp);
        return candidate;
      }, null);
      const query = oldest ? `?before=${encodeURIComponent(oldest.toISOString())}` : "";
      const res = await fetch(`/api/feed/archive${query}`, { cache: "no-store" });
      if (!res.ok) {
        setArchiveStatus("Could not load older posts right now.");
        return;
      }

      const body = (await res.json()) as { posts?: FeedPost[]; hasMore?: boolean };
      const olderPosts = Array.isArray(body.posts) ? body.posts : [];

      if (!olderPosts.length) {
        setHasOlderArchive(false);
        setArchiveStatus("No older posts found.");
        return;
      }

      setPosts((previous) => {
        const seen = new Set(previous.map((post) => post.id));
        const additions = olderPosts.filter((post) => !seen.has(post.id));
        return [...previous, ...additions];
      });
      setHasOlderArchive(Boolean(body.hasMore));
      setArchiveStatus(`Loaded ${olderPosts.length} older post${olderPosts.length === 1 ? "" : "s"}.`);
    } catch {
      setArchiveStatus("Could not load older posts right now.");
    } finally {
      setLoadingOlderArchive(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-end text-[11px]">
        <label className="inline-flex items-center gap-2 text-[var(--text-strong)]">
          <span>Stream type</span>
          <select
            value={mode}
            className="border-0 bg-transparent p-0 pr-5 text-[11px] text-slate-300 outline-none"
            onChange={async (e) => {
              const nextMode = e.target.value as FeedMode;
              setMode(nextMode);
              await patchPrefs({ mode: nextMode });
              window.location.reload();
            }}
          >
            {FEED_MODES.map((m) => (
              <option key={m} value={m} className="bg-[#151b28] text-slate-100">{toTitleCase(m)}</option>
            ))}
          </select>
        </label>
      </div>

      {allowComposer && openComposer ? (
        <div id="communicate" className="fixed inset-0 z-40 flex items-start justify-center bg-black/55 p-4 pt-20">
          <article className="w-full max-w-3xl rounded-md border border-[var(--border)] bg-[#0f1624] p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <button type="button" className="underline" onClick={() => insertFormat("**", "**")}>B</button>
                <button type="button" className="underline italic" onClick={() => insertFormat("_", "_")}>I</button>
                <button type="button" className="underline" onClick={() => insertFormat("<u>", "</u>")}>U</button>
                <button type="button" className="line-through underline-offset-2" onClick={() => insertFormat("~~", "~~")}>S</button>
                <button type="button" className="underline" onClick={() => insertFormat("\n# ", "")}>H1</button>
                <button type="button" className="underline" onClick={() => insertFormat("\n## ", "")}>H2</button>
                <button type="button" className="underline" onClick={() => insertFormat("\n### ", "")}>H3</button>
              </div>
              <button type="button" className="text-xs underline" onClick={() => setOpenComposer(false)}>Close</button>
            </div>
            <textarea id="communicate-editor" value={newPost} onChange={(e) => setNewPost(e.target.value)} className="w-full rounded-md border px-2 py-1.5 text-sm" placeholder="Share an update..." rows={6} />
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="rounded-sm border border-transparent px-0.5 py-0 text-[1.1rem] leading-none hover:scale-110"
                    onClick={() => setNewPost((prev) => `${prev}${emoji}`)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              <fieldset className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                {AUDIENCE_OPTIONS.map((option) => {
                  const inputId = `${audienceRadioGroupName}-${option.value.toLowerCase()}`;
                  return (
                    <label key={option.value} htmlFor={inputId} className="inline-flex cursor-pointer items-center gap-1">
                      <input
                        id={inputId}
                        className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
                        type="radio"
                        name={audienceRadioGroupName}
                        value={option.value}
                        checked={composerAudience === option.value}
                        onClick={() => setComposerAudience(option.value)}
                        onChange={(event) => setComposerAudience(normalizeAudience(event.currentTarget.value) ?? "ALL")}
                      />
                      <span>{option.label}</span>
                    </label>
                  );
                })}
                {composerAudience === "GROUPS" ? (
                  <select
                    value={composerGroupId}
                    onChange={(e) => setComposerGroupId(e.target.value)}
                    className="rounded border px-1 py-0 text-[11px]"
                  >
                    {composerGroups.map((group) => (
                      <option key={group.id} value={group.id}>{group.name}</option>
                    ))}
                  </select>
                ) : null}
              </fieldset>

              <div className="ml-auto flex items-center gap-2">
                <label htmlFor="postImage" className="cursor-pointer text-[13px] text-slate-200 underline underline-offset-2">Upload</label>
                <input id="postImage" type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => setImageName(e.currentTarget.files?.[0]?.name ?? "")} />
                <span className="max-w-36 truncate text-xs text-slate-400">{imageName}</span>
                <button
                  className="rounded-md border border-[var(--border)] bg-[#8f7228] px-2 py-1 text-sm text-black"
                  onClick={async () => {
                    if (!newPost.trim()) return;
                    const selectedAudience = normalizeAudience(composerAudience);
                    if (!selectedAudience) {
                      setStatus("Select an audience before posting.");
                      return;
                    }
                    setComposerAudience(selectedAudience);

                    if (selectedAudience === "GROUPS" && composerGroups.length === 0) {
                      setStatus("Join or create a group before posting to Groups.");
                      return;
                    }
                    if (selectedAudience === "GROUPS" && !composerGroupId) {
                      setStatus("Select a group before posting to Groups.");
                      return;
                    }
                    setStatus("Posting...");
                    const input = document.getElementById("postImage") as HTMLInputElement | null;
                    const file = input?.files?.[0];
                    const imageUrl = file ? await uploadImage(file) : null;
                    const payload: {
                      content: string;
                      audience: Audience;
                      groupId?: string;
                      imageUrl?: string;
                    } = {
                      content: newPost,
                      audience: selectedAudience,
                      ...(selectedAudience === "GROUPS" ? { groupId: composerGroupId } : {}),
                    };
                    if (imageUrl) {
                      payload.imageUrl = imageUrl;
                    }
                    const res = await fetch("/api/posts", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(payload),
                    });
                    if (!res.ok) {
                      let message = "Could not post. Check audience/group selection.";
                      try {
                        const body = (await res.json()) as { error?: string };
                        if (body.error) message = body.error;
                      } catch {
                        // no-op
                      }
                      setStatus(message);
                      return;
                    }
                    setNewPost("");
                    setImageName("");
                    setComposerAudience("ALL");
                    setOpenComposer(false);
                    setStatus("Posted");
                    window.location.reload();
                  }}
                >
                  Post
                </button>
              </div>
            </div>
            {status ? <p className="mt-1 text-xs text-slate-300">{status}</p> : null}
          </article>
        </div>
      ) : null}

      {posts.map((post, idx) => {
        const { roots, byParent } = buildCommentTree(post.comments);
        const renderThread = (comment: Comment, depth: number, rootId: string): JSX.Element => {
          const children = byParent[comment.id] ?? [];
          const key = `${post.id}:${rootId}`;
          const expanded = expandedThreads[key] ?? false;
          const isRoot = depth === 0;
          const canShowChildren = !isRoot || expanded;

          return (
            <div key={comment.id} style={{ marginLeft: `${Math.min(depth, 3) * 14}px` }} className="space-y-1">
              <div className="rounded-md bg-[#0b1220] px-3 py-2 text-sm">
                <Link href={`/profile/${comment.author.username}`} className="mr-1 text-slate-300 hover:underline">@{comment.author.username}</Link>
                <span className="text-slate-200">{comment.content}</span>
                <button
                  type="button"
                  className="ml-2 text-xs text-slate-400 hover:text-slate-100"
                  onClick={() => openReply(post.id, comment.id, `@${comment.author.username} `)}
                >
                  {`\u{21A9}`}
                </button>
              </div>

              {isRoot && children.length > 0 ? (
                <button
                  type="button"
                  className="ml-1 text-xs text-slate-400 underline"
                  onClick={() => setExpandedThreads((prev) => ({ ...prev, [key]: !expanded }))}
                >
                  {expanded ? "Hide replies" : `Show ${children.length} repl${children.length === 1 ? "y" : "ies"}`}
                </button>
              ) : null}

              {children.length > 0 && canShowChildren ? (
                <div className="space-y-1">
                  {children.map((child) => renderThread(child, depth + 1, rootId))}
                </div>
              ) : null}
            </div>
          );
        };

        return (
          <article key={post.id} className={`rounded-[10px] px-6 py-5 shadow-sm ${idx % 2 === 0 ? "bg-[#121a2a]" : "bg-[#0f1726]"}`}>
            <p className="text-[14px] font-semibold">
              <Link href={`/profile/${post.author.username}`} className="text-slate-100 hover:underline">@{post.author.username}</Link>
            </p>
            <p className="mt-2 max-w-[65ch] text-[18px] leading-[1.55]">{post.content}</p>

            {(() => {
              const media = parseMedia(post.mediaUrlsJson);
              if (media.length > 0) {
                return (
                  <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
                    {media.map((url) => (
                      <Image key={url} src={url} alt="Post media" width={800} height={600} className="h-32 w-full rounded-md object-cover" />
                    ))}
                  </div>
                );
              }
              return post.imageUrl ? <Image src={post.imageUrl} alt="Post" width={1200} height={800} className="mt-3 max-h-80 w-full rounded-md object-cover" /> : null;
            })()}

            <div className="mt-3 flex flex-wrap items-center gap-4 text-[13px] text-slate-300">
              <button className="inline-flex items-center gap-1 hover:text-white" onClick={async () => { await fetch(`/api/posts/${post.id}/reactions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "LIKE" }) }); window.location.reload(); }}>{`\u{2764}\u{FE0F}`} Like {post.reactions.length}</button>
              <button className="inline-flex items-center gap-1 hover:text-white" onClick={async () => { await fetch(`/api/posts/${post.id}/share`, { method: "POST" }); window.location.reload(); }}>{`\u{1F501}`} Repost</button>
              <button className="inline-flex items-center gap-1 hover:text-white" onClick={() => openReply(post.id, null, "")}>{`\u{1F4AC}`} Reply</button>
              <details className="relative">
                <summary className="cursor-pointer list-none text-slate-400 hover:text-white">{`\u{22EF}`}</summary>
                <div className="absolute right-0 top-5 rounded-md bg-[#0b1220] p-2 shadow-lg">
                  <button className="text-xs text-slate-200 hover:text-white" onClick={async () => { await patchPrefs({ hidePostId: post.id }); window.location.reload(); }}>Hide post</button>
                </div>
              </details>
            </div>

            <div className="mt-4 space-y-2">
              {roots.map((root) => renderThread(root, 0, root.id))}

              {replyPostId === post.id ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const content = (draftByPost[post.id] ?? "").trim();
                    if (!content) return;
                    const res = await fetch(`/api/posts/${post.id}/comments`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ content, parentCommentId: replyParentByPost[post.id] ?? null }),
                    });
                    if (!res.ok) {
                      let message = "Could not add comment.";
                      try {
                        const body = (await res.json()) as { error?: string };
                        if (body.error) message = body.error;
                      } catch {
                        // no-op
                      }
                      setCommentErrorByPost((prev) => ({ ...prev, [post.id]: message }));
                      return;
                    }
                    setDraftByPost((prev) => ({ ...prev, [post.id]: "" }));
                    setReplyPostId(null);
                    setReplyParentByPost((prev) => ({ ...prev, [post.id]: null }));
                    window.location.reload();
                  }}
                  className="space-y-1"
                >
                  <input
                    ref={(el) => { commentInputRefs.current[post.id] = el; }}
                    value={draftByPost[post.id] ?? ""}
                    onChange={(e) => setDraftByPost((prev) => ({ ...prev, [post.id]: e.target.value }))}
                    className="w-full rounded-md border px-3 py-1.5 text-sm"
                    placeholder="Write a comment"
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-1">
                      {EMOJIS.slice(0, 6).map((emoji) => (
                        <button
                          key={`${post.id}-${emoji}`}
                          type="button"
                          className="rounded-sm border border-transparent px-0.5 py-0 text-[0.92rem] leading-none hover:scale-110"
                          onClick={() => setDraftByPost((prev) => ({ ...prev, [post.id]: `${prev[post.id] ?? ""}${emoji}` }))}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-3">
                      <button type="button" className="text-xs underline" onClick={() => setReplyPostId(null)}>Cancel</button>
                      <button className="text-sm font-medium" type="submit">Comment</button>
                    </div>
                  </div>
                  {commentErrorByPost[post.id] ? <p className="text-xs text-red-300">{commentErrorByPost[post.id]}</p> : null}
                </form>
              ) : null}
            </div>
          </article>
        );
      })}

      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <p>Mode: {modeLabel}. Fast stream window: {fastWindowDays} days.</p>
        {hasOlderArchive ? (
          <button
            type="button"
            className="underline hover:text-slate-300 disabled:opacity-60"
            onClick={() => void loadOlderArchive()}
            disabled={loadingOlderArchive}
          >
            {loadingOlderArchive ? "Loading older..." : "Load older (slow archive)"}
          </button>
        ) : null}
      </div>
      {archiveStatus ? <p className="text-[11px] text-slate-500">{archiveStatus}</p> : null}
    </section>
  );
}
