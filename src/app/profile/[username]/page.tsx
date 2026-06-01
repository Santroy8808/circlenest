import Image from "next/image";
import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { FeedClient } from "@/components/feed/feed-client";
import { FriendStreamPostComposer } from "@/components/profile/friend-stream-post-composer";
import { DirectMessageButton } from "@/components/messages/direct-message-button";
import { prisma } from "@/lib/db/prisma";

export default async function ProfilePage({ params }: { params: { username: string } }) {
  const session = await auth();
  const user = await prisma.user.findUnique({
    where: { username: params.username },
    include: {
      profile: { include: { theme: true } },
      friendsA: true,
      friendsB: true,
    },
  });

  if (!user) notFound();

  const profile = user.profile;
  let detailedBio: Record<string, string> = {};
  try {
    detailedBio = profile?.detailedBioJson ? (JSON.parse(profile.detailedBioJson) as Record<string, string>) : {};
  } catch {
    detailedBio = {};
  }
  const theme = profile?.theme;
  const friendCount = user.friendsA.length + user.friendsB.length;
  const isOwner = session?.user?.id === user.id;
  const isFriendOrFamily = Boolean(
    session?.user?.id &&
      (user.friendsA.some((f) => f.userBId === session.user?.id) || user.friendsB.some((f) => f.userAId === session.user?.id)),
  );

  const streamPostsRaw = await prisma.post.findMany({
    where: {
      OR: [{ authorId: user.id }, { streamOwnerId: user.id }],
      approvalStatus: "APPROVED",
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: {
      author: { select: { username: true } },
      comments: {
        select: {
          id: true,
          content: true,
          parentCommentId: true,
          createdAt: true,
          author: { select: { username: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      reactions: true,
    },
  });

  const pendingStreamPosts = isOwner
    ? await prisma.post.findMany({
        where: { streamOwnerId: user.id, approvalStatus: "PENDING" },
        orderBy: { createdAt: "desc" },
        include: { author: { select: { username: true } } },
      })
    : [];

  const streamPosts = streamPostsRaw.map((post) => ({
    id: post.id,
    content: post.content,
    topic: post.topic,
    imageUrl: post.imageUrl,
    mediaUrlsJson: post.mediaUrlsJson,
    createdAt: post.createdAt,
    authorId: post.authorId,
    author: { username: post.author.username },
    comments: post.comments.map((comment) => ({
      id: comment.id,
      content: comment.content,
      mediaUrlsJson: null,
      parentCommentId: comment.parentCommentId,
      author: { username: comment.author.username },
    })),
    reactions: post.reactions.map((reaction) => ({ id: reaction.id, type: reaction.type })),
    explanation: `Posted on @${user.username}'s stream`,
  }));

  return (
    <AppShell>
      <section
        className="card overflow-hidden"
      >
        <div className="relative h-44 w-full bg-slate-200">
          {profile?.bannerUrl ? (
            <Image src={profile.bannerUrl} alt="Profile banner" fill unoptimized className="object-cover" />
          ) : null}
        </div>
        <div className="p-3">
          <div className="mb-2 flex items-center gap-3">
            <div className="relative h-16 w-16 overflow-hidden rounded-md border border-[var(--border)] bg-slate-100">
              {profile?.avatarUrl ? (
                <Image src={profile.avatarUrl} alt="Profile avatar" fill unoptimized className="object-cover" />
              ) : null}
            </div>
            <div>
              <h1 className="text-lg font-bold">{profile?.displayName || user.username}</h1>
              <p className="text-xs text-slate-300">@{user.username}</p>
              <p className="text-xs text-slate-300">{friendCount} friends</p>
              {!isOwner && session?.user?.id ? (
                <div className="mt-2">
                  <DirectMessageButton username={user.username} label="Direct Message" />
                </div>
              ) : null}
            </div>
          </div>
          {isOwner ? (
            <div className="mb-2 flex flex-wrap gap-2 text-sm">
              <Link href="/profile/edit" className="underline">Edit Profile</Link>
              <Link href="/settings/theme" className="underline">Theme Settings</Link>
              <Link href="/profile/scientology" className="underline">My Scientology</Link>
              <Link href="/profile/resume" className="underline">Resume Builder</Link>
            </div>
          ) : null}
          <div className="mb-2 flex flex-wrap gap-2 text-xs">
            {isOwner || profile?.scientologyVisible ? <Link href={`/profile/${user.username}/scientology`} className="underline">My Scientology Page</Link> : null}
            {isOwner || profile?.resumeVisible ? <Link href={`/profile/${user.username}/resume`} className="underline">Resume</Link> : null}
          </div>

          <div className="grid gap-1 text-sm">
            <p><span className="font-medium">Bio:</span> {profile?.bio || "No bio yet."}</p>
            {profile?.headline ? <p><span className="font-medium">Headline:</span> {profile.headline}</p> : null}
            <p><span className="font-medium">Location:</span> {profile?.location || "Not set"}</p>
            <p><span className="font-medium">Interests:</span> {profile?.interests || "Not set"}</p>
            <p><span className="font-medium">Relationship:</span> {profile?.relationshipStatus || "Not set"}</p>
            <p><span className="font-medium">Theme:</span> {theme?.name || "Drakudai"}</p>
            {Object.keys(detailedBio).length > 0 ? (
              <div className="mt-1 rounded-md border border-[var(--border)] p-2 text-xs">
                <p className="mb-1 font-semibold text-[var(--text-strong)]">Detailed Bio</p>
                {Object.entries(detailedBio).map(([k, v]) => v ? <p key={k}><span className="font-medium">{k}:</span> {v}</p> : null)}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mt-4 space-y-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{isOwner ? "Your Stream" : `${profile?.displayName || user.username}'s Stream`}</h2>
        </div>
        {!isOwner && isFriendOrFamily ? <FriendStreamPostComposer username={user.username} /> : null}
        {isOwner && pendingStreamPosts.length ? (
          <section className="card p-3">
            <p className="mb-2 text-sm font-semibold text-[var(--text-strong)]">Pending Friend/Family Stream Posts</p>
            <div className="space-y-2">
              {pendingStreamPosts.map((post) => (
                <form
                  key={post.id}
                  action={async () => {
                    "use server";
                    const { auth } = await import("@/auth");
                    const { prisma } = await import("@/lib/db/prisma");
                    const current = await auth();
                    if (!current?.user?.id || current.user.id !== user.id) return;
                    await prisma.post.update({ where: { id: post.id }, data: { approvalStatus: "APPROVED" } });
                    await prisma.notification.create({
                      data: {
                        userId: post.authorId,
                        type: "STREAM_POST_APPROVED",
                        body: "Your post on a friend/family stream was approved.",
                        targetUrl: `/posts/${post.id}`,
                      },
                    });
                  }}
                  className="rounded border border-[var(--border)] p-2"
                >
                  <p className="text-sm text-slate-200">
                    <span className="font-medium">@{post.author.username}</span> {post.content}
                  </p>
                  <button type="submit" className="mt-2 rounded border px-2 py-1 text-xs">Approve</button>
                </form>
              ))}
            </div>
          </section>
        ) : null}
        <FeedClient
          initialPosts={streamPosts}
          initialMode="CHRONOLOGICAL"
          currentUserId={session?.user?.id ?? ""}
          currentUserAvatarUrl={profile?.avatarUrl ?? null}
          currentUserDisplayName={profile?.displayName ?? user.username}
          allowComposer={isOwner}
        />
        {streamPosts.length === 0 ? <div className="card p-4 text-sm text-slate-600">No activity yet.</div> : null}
      </section>
    </AppShell>
  );
}
