import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MessagesClient } from "@/components/messages/messages-client";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { timeServerStep } from "@/lib/platform/server-timing";
import {
  getChatThread,
  safeListChatThreads
} from "@/modules/chat-messages/chat-messages.service";

export default async function MessagesPage({ searchParams }: { searchParams: { thread?: string } }) {
  const session = await timeServerStep("messages.auth", auth());

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/messages");
  }

  const activeActor = await timeServerStep("messages.actor", getActiveAccountActor(session.user.id));
  const threads = await timeServerStep("messages.chat-threads", safeListChatThreads(activeActor.actorUserId));
  const selected = searchParams.thread ? await timeServerStep("messages.selected-thread", getChatThread(activeActor.actorUserId, searchParams.thread)) : null;

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
