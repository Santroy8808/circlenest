import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { ThreadClient } from "@/components/messages/thread-client";

export default async function ThreadPage({ params }: { params: { threadId: string } }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <AppShell>
      <div className="card flex min-h-[calc(100dvh-220px)] flex-col p-4 md:p-5">
        <ThreadClient threadId={params.threadId} myUserId={session.user.id} />
      </div>
    </AppShell>
  );
}
