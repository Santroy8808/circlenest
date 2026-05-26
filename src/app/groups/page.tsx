import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";

export default async function GroupsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const groups = await prisma.group.findMany({
    include: { members: true, events: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AppShell>
      <div className="space-y-4">
        <CreateGroupCard />
        <section className="grid gap-3">
          {groups.map((g) => (
            <article key={g.id} className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{g.name}</h2>
                  <p className="text-sm text-slate-600">{g.description || "No description"}</p>
                </div>
                <Link href={`/groups/${g.id}`} className="rounded bg-blue-600 px-3 py-2 text-sm text-white">
                  Open Group
                </Link>
              </div>
              <div className="mt-3 flex gap-4 text-xs text-slate-600">
                <span>{g.visibility}</span>
                <span>{g.members.length} members</span>
                <span>{g.events.length} events</span>
              </div>
            </article>
          ))}
        </section>
      </div>
    </AppShell>
  );
}

function CreateGroupCard() {
  return (
    <section className="card p-4">
      <h1 className="mb-2 text-xl font-semibold">Groups</h1>
      <p className="mb-3 text-sm text-slate-600">Create communities with events, forum threads, documents, and photo sharing.</p>
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
          if (!name) return;

          const group = await prisma.group.create({
            data: {
              name,
              description: description || null,
              visibility: visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC",
              ownerId: session.user.id,
            },
          });

          await prisma.groupMember.create({
            data: { groupId: group.id, userId: session.user.id, role: "CREATOR" },
          });
        }}
        className="grid gap-2 md:grid-cols-[1fr_2fr_auto_auto]"
      >
        <input name="name" placeholder="Group name" className="rounded border border-slate-300 px-3 py-2" required />
        <input name="description" placeholder="Group description" className="rounded border border-slate-300 px-3 py-2" />
        <select name="visibility" className="rounded border border-slate-300 px-3 py-2">
          <option value="PUBLIC">Public</option>
          <option value="PRIVATE">Private</option>
        </select>
        <button className="rounded bg-slate-900 px-3 py-2 text-white" type="submit">Create</button>
      </form>
    </section>
  );
}

