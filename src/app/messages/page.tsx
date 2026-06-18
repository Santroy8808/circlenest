import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MessagesClient } from "@/components/messages/messages-client";
import { AppShell } from "@/components/platform/app-shell";
import {
  getChatThread,
  safeListChatThreads
} from "@/modules/chat-messages/chat-messages.service";

export default async function MessagesPage({ searchParams }: { searchParams: { thread?: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/messages");
  }

  const threads = await safeListChatThreads(session.user.id);
  const selected = searchParams.thread ? await getChatThread(session.user.id, searchParams.thread) : null;

  return (
    <AppShell>
      <MessagesClient
        currentUserId={session.user.id}
        initialSelectedThread={selected?.ok ? selected.thread : null}
        initialThreads={threads}
      />
    </AppShell>
  );
}
