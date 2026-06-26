import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MessagesClient } from "@/components/messages/messages-client";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import {
  getChatThread,
  safeListChatThreads
} from "@/modules/chat-messages/chat-messages.service";

export default async function MessagesPage({ searchParams }: { searchParams: { thread?: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/messages");
  }

  const activeActor = await getActiveAccountActor(session.user.id);
  const threads = await safeListChatThreads(activeActor.actorUserId);
  const selected = searchParams.thread ? await getChatThread(activeActor.actorUserId, searchParams.thread) : null;

  return (
    <AppShell>
      <MessagesClient
        currentUserId={activeActor.actorUserId}
        initialSelectedThread={selected?.ok ? selected.thread : null}
        initialThreads={threads}
      />
    </AppShell>
  );
}
