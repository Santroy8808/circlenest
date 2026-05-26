import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { MessagesClient } from "@/components/messages/messages-client";

export default async function MessagesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <AppShell>
      <div className="card p-4">
        <h1 className="mb-3 text-xl font-semibold">Messages</h1>
        <MessagesClient />
      </div>
    </AppShell>
  );
}
