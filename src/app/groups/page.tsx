import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { GroupsIndexClient } from "@/components/groups/groups-index-client";

export default async function GroupsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const groups = await prisma.group.findMany({
    include: {
      owner: { select: { username: true } },
      members: { select: { userId: true } },
      joinRequests: {
        where: { userId: session.user.id, status: "PENDING" },
        select: { id: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AppShell>
      <div className="space-y-4">
        <CreateGroupCard />
        <GroupsIndexClient
          groups={groups.map((g) => ({
            id: g.id,
            name: g.name,
            description: g.description,
            visibility: g.visibility,
            joinMode: g.joinMode === "REQUEST" ? "REQUEST" : "OPEN",
            ownerUsername: g.owner.username,
            memberCount: g.members.length,
            isMember: g.members.some((member) => member.userId === session.user.id),
            hasPendingRequest: g.joinRequests.length > 0,
          }))}
        />
      </div>
    </AppShell>
  );
}

function CreateGroupCard() {
  return (
    <section className="card p-4">
      <h1 className="mb-2 text-xl font-semibold">Groups</h1>
      <p className="mb-3 text-sm text-slate-600">Create communities with forum threads, documents, and photo sharing.</p>
      <form
        action={async (formData) => {
          "use server";
          const { auth } = await import("@/auth");
          const { prisma } = await import("@/lib/db/prisma");
          const session = await auth();
          if (!session?.user?.id) return;

          const name = String(formData.get("name") ?? "").trim();
          const description = String(formData.get("description") ?? "").trim();
          const visibility = String(formData.get("visibility") ?? "PUBLIC");
          const joinMode = String(formData.get("joinMode") ?? "OPEN");
          if (!name) return;

          const group = await prisma.group.create({
            data: {
              name,
              description: description || null,
              visibility: visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC",
              joinMode: joinMode === "REQUEST" ? "REQUEST" : "OPEN",
              ownerId: session.user.id,
            },
          });

          await prisma.groupMember.create({
            data: { groupId: group.id, userId: session.user.id, role: "MODERATOR" },
          });
        }}
        className="grid gap-2 md:grid-cols-[1fr_2fr_auto_auto_auto]"
      >
        <input name="name" placeholder="Group name" className="rounded border border-slate-300 px-3 py-2" required />
        <input name="description" placeholder="Group description" className="rounded border border-slate-300 px-3 py-2" />
        <select name="visibility" className="rounded border border-slate-300 px-3 py-2">
          <option value="PUBLIC">Public</option>
          <option value="PRIVATE">Private</option>
        </select>
        <select name="joinMode" className="rounded border border-slate-300 px-3 py-2">
          <option value="OPEN">Open join</option>
          <option value="REQUEST">Request to join</option>
        </select>
        <button className="rounded bg-slate-900 px-3 py-2 text-white" type="submit">Create</button>
      </form>
    </section>
  );
}

