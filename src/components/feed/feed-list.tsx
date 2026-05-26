import { getFeedForMode } from "@/lib/feed/ranking";
import type { FeedMode } from "@/lib/feed/modes";

export async function FeedList({ userId, mode }: { userId: string; mode: FeedMode }) {
  const posts = await getFeedForMode(userId, mode);

  return (
    <section className="space-y-4">
      {posts.map((post) => (
        <article key={post.id} className="card p-4">
          <p className="text-sm text-slate-500">@{post.authorUsername}</p>
          <p className="mt-2">{post.content}</p>
          <p className="mt-3 text-xs text-slate-500">Why am I seeing this? {post.explanation}</p>
        </article>
      ))}
    </section>
  );
}
