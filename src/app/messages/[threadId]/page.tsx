import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { ThreadClient } from "@/components/messages/thread-client";

export default async function ThreadPage({ params }: { params: { threadId: string } }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <AppShell>
      <div className="card p-4">
        <h1 className="mb-3 text-xl font-semibold">Thread</h1>
        <ThreadClient threadId={params.threadId} myUserId={session.user.id} />
      </div>
    </AppShell>
  );
}
