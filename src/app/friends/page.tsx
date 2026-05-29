import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { FriendsClient } from "@/components/friends/friends-client";

export default async function FriendsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const me = session.user.id;

  const [links, incoming, outgoing, suggestions, follows] = await Promise.all([
    prisma.friendship.findMany({ where: { OR: [{ userAId: me }, { userBId: me }] } }),
    prisma.friendRequest.findMany({ where: { receiverId: me, status: "PENDING" }, include: { sender: { select: { id: true, username: true } } } }),
    prisma.friendRequest.findMany({ where: { senderId: me, status: "PENDING" }, include: { receiver: { select: { id: true, username: true } } } }),
    prisma.user.findMany({ where: { id: { not: me } }, select: { id: true, username: true }, take: 24 }),
    prisma.userFollow.findMany({ where: { followerId: me }, select: { followingId: true } }),
  ]);

  const followingIds = follows.map((f) => f.followingId);
  const friendIds = links.map((f) => (f.userAId === me ? f.userBId : f.userAId));
  const friends = await prisma.user.findMany({
    where: { id: { in: friendIds } },
    select: {
      id: true,
      username: true,
      fullName: true,
      profile: { select: { displayName: true, avatarUrl: true } },
    },
  });

  return (
    <AppShell>
      <FriendsClient
        friends={friends}
        incoming={incoming}
        outgoing={outgoing}
        suggestions={suggestions.filter((u) => !friendIds.includes(u.id) && u.id !== me)}
        followingIds={followingIds}
      />
    </AppShell>
  );
}
