import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";

export default async function BlockedUsersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const rows = await prisma.userBlock.findMany({
    where: { userId: session.user.id },
    include: { blockedUser: { select: { id: true, username: true, fullName: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AppShell>
      <section className="card space-y-3 p-4">
        <h1 className="text-xl font-semibold">Blocked Users</h1>
        <p className="text-sm text-slate-400">People you block cannot friend request you, message you, or post on your stream.</p>
        <div className="space-y-2">
          {rows.map((row) => (
            <form
              key={row.id}
              action={async () => {
                "use server";
                const { auth } = await import("@/auth");
                const { prisma } = await import("@/lib/db/prisma");
                const current = await auth();
                if (!current?.user?.id) return;
                const existing = await prisma.userBlock.findUnique({ where: { id: row.id } });
                if (!existing || existing.userId !== current.user.id) return;
                await prisma.userBlock.delete({ where: { id: row.id } });
              }}
              className="flex items-center justify-between rounded border border-[var(--border)] p-2"
            >
              <p className="text-sm">@{row.blockedUser.username} {row.blockedUser.fullName ? `(${row.blockedUser.fullName})` : ""}</p>
              <button type="submit" className="rounded border px-2 py-1 text-xs">Unblock</button>
            </form>
          ))}
          {rows.length === 0 ? <p className="text-sm text-slate-500">No blocked users.</p> : null}
        </div>
      </section>
    </AppShell>
  );
}

