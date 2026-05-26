"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { FEED_MODES, type FeedMode } from "@/lib/feed/modes";

const EMOJIS = ["😀", "😂", "😍", "👍", "🔥", "🎉", "🙏", "💡", "❤️", "😎", "🤝", "🌟"] as const;

type Comment = { id: string; content: string; author: { username: string } };
type Reaction = { id: string; type: string };
type FeedPost = {
  id: string;
  content: string;
  topic: string | null;
  imageUrl: string | null;
  authorId: string;
  author: { username: string };
  comments: Comment[];
  reactions: Reaction[];
  explanation: string;
};

async function patchPrefs(payload: Record<string, string | boolean>) {
  await fetch("/api/feed/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function uploadImage(file: File): Promise<string | null> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) return null;
  const body = (await res.json()) as { url?: string };
  return body.url ?? null;
}

export function FeedClient({
  initialPosts,
  currentUserId,
  showComposer = true,
}: {
  initialPosts: FeedPost[];
  currentUserId: string;
  showComposer?: boolean;
}) {
  const [posts] = useState(initialPosts);
  const [newPost, setNewPost] = useState("");
  const [status, setStatus] = useState("");

  return (
    <section className="space-y-4">
      {showComposer ? (
        <article className="card p-4">
          <h2 className="mb-2 text-sm font-semibold">Create Post</h2>
          <textarea value={newPost} onChange={(e) => setNewPost(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" placeholder="Share an update..." />
          <div className="mt-2 flex flex-wrap gap-1">
            {EMOJIS.map((emoji) => (
              <button key={emoji} type="button" className="rounded border border-slate-300 px-1.5 py-0.5 text-xs" onClick={() => setNewPost((prev) => `${prev}${emoji}`)}>
                {emoji}
              </button>
            ))}
          </div>
          <input id="postImage" type="file" accept="image/png,image/jpeg,image/webp" className="mt-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
          <div className="mt-2 flex justify-between">
            <p className="text-xs text-slate-600">{status}</p>
            <button
              className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-sm text-white"
              onClick={async () => {
                if (!newPost.trim()) return;
                setStatus("Posting...");
                const input = document.getElementById("postImage") as HTMLInputElement | null;
                const file = input?.files?.[0];
                const imageUrl = file ? await uploadImage(file) : null;
                await fetch("/api/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: newPost, imageUrl }) });
                setNewPost("");
                setStatus("Posted");
                window.location.reload();
              }}
            >
              Post
            </button>
          </div>
        </article>
      ) : null}

      {posts.map((post) => (
        <article key={post.id} className="card p-4">
          <p className="text-xs text-slate-500">
            <Link href={`/profile/${post.author.username}`} className="underline-offset-2 hover:underline">
              @{post.author.username}
            </Link>
          </p>
          <p className="mt-1 text-sm">{post.content}</p>
          {post.imageUrl ? <Image src={post.imageUrl} alt="Post" width={1200} height={800} className="mt-2 max-h-80 w-full rounded-lg object-cover" /> : null}
          <p className="mt-2 text-[11px] text-slate-500">Why in my stream: {post.explanation}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="rounded border border-slate-300 px-2 py-1 text-sm" onClick={async () => { await fetch(`/api/posts/${post.id}/reactions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "LIKE" }) }); window.location.reload(); }}>Like ({post.reactions.length})</button>
            <button className="rounded border border-slate-300 px-2 py-1 text-sm" onClick={async () => { await fetch(`/api/posts/${post.id}/share`, { method: "POST" }); window.location.reload(); }}>Share/Repost</button>
            <button className="rounded border border-slate-300 px-2 py-1 text-sm" onClick={async () => { await patchPrefs({ hidePostId: post.id }); window.location.reload(); }}>Hide</button>
            {post.authorId === currentUserId ? (
              <>
                <button className="rounded border border-slate-300 px-2 py-1 text-sm" onClick={async () => { const content = window.prompt("Edit post", post.content); if (!content) return; await fetch(`/api/posts/${post.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) }); window.location.reload(); }}>Edit</button>
                <button className="rounded border border-red-300 px-2 py-1 text-sm text-red-700" onClick={async () => { await fetch(`/api/posts/${post.id}`, { method: "DELETE" }); window.location.reload(); }}>Delete</button>
              </>
            ) : null}
          </div>
          <div className="mt-3 space-y-2">
            {post.comments.map((c) => (
              <p key={c.id} className="rounded bg-slate-50 px-2 py-1 text-sm">
                <Link href={`/profile/${c.author.username}`} className="font-medium underline-offset-2 hover:underline">
                  @{c.author.username}
                </Link>{" "}
                {c.content}
              </p>
            ))}
            <form onSubmit={async (e) => { e.preventDefault(); const form = new FormData(e.currentTarget); const content = String(form.get("content") ?? ""); if (!content.trim()) return; await fetch(`/api/posts/${post.id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) }); (e.currentTarget as HTMLFormElement).reset(); window.location.reload(); }} className="space-y-2">
              <input name="content" className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm" placeholder="Write a comment" />
              <div className="flex flex-wrap gap-1">
                {EMOJIS.map((emoji) => (
                  <button
                    key={`${post.id}-${emoji}`}
                    type="button"
                    className="rounded border border-slate-300 px-2 py-1 text-xs"
                    onClick={(e) => {
                      const formEl = (e.currentTarget as HTMLButtonElement).closest("form");
                      const input = formEl?.querySelector("input[name='content']") as HTMLInputElement | null;
                      if (input) input.value = `${input.value}${emoji}`;
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <button className="rounded bg-slate-900 px-2 py-1 text-sm text-white" type="submit">Comment</button>
            </form>
          </div>
        </article>
      ))}
    </section>
  );
}
