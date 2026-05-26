import Image from "next/image";
import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { FeedClient } from "@/components/feed/feed-client";
import { prisma } from "@/lib/db/prisma";

export default async function ProfilePage({ params }: { params: { username: string } }) {
  const session = await auth();
  const user = await prisma.user.findUnique({
    where: { username: params.username },
    include: {
      profile: { include: { theme: true } },
      posts: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          author: { select: { username: true } },
          comments: { include: { author: { select: { username: true } } }, orderBy: { createdAt: "asc" } },
          reactions: true,
        },
      },
      friendsA: true,
      friendsB: true,
    },
  });

  if (!user) notFound();

  const profile = user.profile;
  const theme = profile?.theme;
  const friendCount = user.friendsA.length + user.friendsB.length;
  const isOwner = session?.user?.id === user.id;
  const streamPosts = user.posts.map((post) => ({
    id: post.id,
    content: post.content,
    topic: post.topic,
    imageUrl: post.imageUrl,
    authorId: post.authorId,
    author: { username: post.author.username },
    comments: post.comments.map((comment) => ({ id: comment.id, content: comment.content, author: { username: comment.author.username } })),
    reactions: post.reactions.map((reaction) => ({ id: reaction.id, type: reaction.type })),
    explanation: `Posted on @${user.username}'s stream`,
  }));

  return (
    <AppShell>
      <section
        className="card overflow-hidden"
        style={{
          background: theme?.background ?? "#ffffff",
          borderColor: theme?.accentColor ?? "#e5e7eb",
        }}
      >
        <div className="relative h-44 w-full bg-slate-200">
          {profile?.bannerUrl ? (
            <Image src={profile.bannerUrl} alt="Profile banner" fill className="object-cover" />
          ) : null}
        </div>
        <div className="p-6">
          <div className="mb-4 flex items-center gap-4">
            <div className="relative h-20 w-20 overflow-hidden rounded-full border-4 border-white bg-slate-100">
              {profile?.avatarUrl ? (
                <Image src={profile.avatarUrl} alt="Profile avatar" fill className="object-cover" />
              ) : null}
            </div>
            <div>
              <h1 className="text-2xl font-bold">{profile?.displayName || user.username}</h1>
              <p className="text-sm text-slate-600">@{user.username}</p>
              <p className="text-sm text-slate-600">{friendCount} friends</p>
            </div>
          </div>
          {isOwner ? (
            <div className="mb-4 flex flex-wrap gap-2">
              <Link href="/profile/edit" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">Edit Profile</Link>
              <Link href="/settings/theme" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">Theme Settings</Link>
            </div>
          ) : null}

          <div className="grid gap-2 text-sm text-slate-700">
            <p><span className="font-medium">Bio:</span> {profile?.bio || "No bio yet."}</p>
            <p><span className="font-medium">Location:</span> {profile?.location || "Not set"}</p>
            <p><span className="font-medium">Interests:</span> {profile?.interests || "Not set"}</p>
            <p><span className="font-medium">Relationship:</span> {profile?.relationshipStatus || "Not set"}</p>
            <p><span className="font-medium">Theme:</span> {theme?.name || "Default"}</p>
          </div>
        </div>
      </section>

      <section className="mt-4 space-y-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{isOwner ? "Your Stream" : `${profile?.displayName || user.username}'s Stream`}</h2>
        </div>
        <FeedClient initialPosts={streamPosts} currentUserId={session?.user?.id ?? ""} showComposer={isOwner} />
        {streamPosts.length === 0 ? <div className="card p-4 text-sm text-slate-600">No activity yet.</div> : null}
      </section>
    </AppShell>
  );
}
