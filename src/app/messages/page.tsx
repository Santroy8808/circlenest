import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { MessagesClient } from "@/components/messages/messages-client";
import { PushSubscriptionClient } from "@/components/messages/push-subscription-client";

export default async function MessagesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const me = session.user.id;

  const links = await prisma.friendship.findMany({ where: { OR: [{ userAId: me }, { userBId: me }] } });
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
      <div className="card p-4">
        <h1 className="mb-3 text-xl font-semibold">Chat</h1>
        <div className="space-y-4">
          <MessagesClient myUserId={me} friends={friends} />
          <PushSubscriptionClient />
        </div>
      </div>
    </AppShell>
  );
}
