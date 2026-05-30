import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";

export default async function AuditorsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const listings = await prisma.auditorListing.findMany({
    include: { user: { select: { username: true } }, media: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <h1 className="text-xl font-semibold">Find an Auditor</h1>
        <form
          action={async (formData) => {
            "use server";
            const { auth } = await import("@/auth");
            const { prisma } = await import("@/lib/db/prisma");
            const current = await auth();
            if (!current?.user?.id) return;
            const displayName = String(formData.get("displayName") ?? "").trim();
            const classLevel = String(formData.get("classLevel") ?? "").trim();
            if (!displayName || !classLevel) return;
            await prisma.auditorListing.create({
              data: {
                userId: current.user.id,
                displayName,
                classLevel,
                location: String(formData.get("location") ?? "").trim() || null,
                travels: String(formData.get("travels") ?? "") === "on",
                services: String(formData.get("services") ?? "").trim() || null,
                successStories: String(formData.get("successStories") ?? "").trim() || null,
                textStream: String(formData.get("textStream") ?? "").trim() || null,
              },
            });
          }}
          className="grid gap-2 md:grid-cols-2"
        >
          <input name="displayName" placeholder="Display name" className="rounded border px-3 py-2" required />
          <input name="classLevel" placeholder="Auditor class level" className="rounded border px-3 py-2" required />
          <input name="location" placeholder="Location" className="rounded border px-3 py-2" />
          <label className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm"><input name="travels" type="checkbox" /> Travels</label>
          <textarea name="services" placeholder="Services delivered" className="rounded border px-3 py-2 md:col-span-2" />
          <textarea name="successStories" placeholder="Success stories" className="rounded border px-3 py-2 md:col-span-2" />
          <textarea name="textStream" placeholder="Text-only stream intro" className="rounded border px-3 py-2 md:col-span-2" />
          <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-white md:col-span-2">Create Listing</button>
        </form>
        <div className="space-y-2">
          {listings.map((listing) => (
            <article key={listing.id} className="rounded border border-[var(--border)] p-3">
              <p className="font-medium">{listing.displayName}</p>
              <p className="text-sm text-slate-500">{listing.classLevel} • {listing.location || "No location"} • @{listing.user.username}</p>
              <p className="text-sm">{listing.services || "No services listed yet."}</p>
              {listing.successStories ? <p className="text-xs text-slate-500">{listing.successStories}</p> : null}
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

