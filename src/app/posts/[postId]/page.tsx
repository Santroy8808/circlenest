import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { PostDiscussionClient } from "@/components/feed/post-discussion-client";

export default async function PostDiscussionPage({ params }: { params: { postId: string } }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const post = await prisma.post.findUnique({
    where: { id: params.postId },
    include: {
      author: { select: { id: true, username: true } },
      poll: {
        include: {
          options: { include: { _count: { select: { votes: true } } } },
          votes: { where: { voterId: session.user.id }, select: { optionId: true } },
        },
      },
      comments: {
        include: { author: { select: { username: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!post) notFound();

  return (
    <AppShell>
      <PostDiscussionClient post={post} currentUserId={session.user.id} />
    </AppShell>
  );
}
