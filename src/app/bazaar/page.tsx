import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { BazaarClient } from "@/components/bazaar/bazaar-client";

export default async function BazaarPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const listings = await prisma.bazaarListing.findMany({
    where: { status: "ACTIVE" },
    include: { seller: { select: { id: true, username: true } } },
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div>
          <h1 className="text-xl font-semibold">Bazaar</h1>
          <p className="text-sm text-slate-500">Marketplace listings with search and filters.</p>
        </div>
        <form
          action={async (formData) => {
            "use server";
            const { auth } = await import("@/auth");
            const { prisma } = await import("@/lib/db/prisma");
            const current = await auth();
            if (!current?.user?.id) return;
            const title = String(formData.get("title") ?? "").trim();
            const price = Number(formData.get("price"));
            if (!title || Number.isNaN(price) || price < 0) return;
            await prisma.bazaarListing.create({
              data: {
                sellerId: current.user.id,
                title,
                price,
                description: String(formData.get("description") ?? "").trim() || null,
                location: String(formData.get("location") ?? "").trim() || null,
                category: String(formData.get("category") ?? "").trim() || null,
              },
            });
          }}
          className="grid gap-2 md:grid-cols-2"
        >
          <input name="title" required placeholder="Listing title" className="rounded border border-slate-300 px-3 py-2" />
          <input name="price" required placeholder="Price" type="number" min="0" step="0.01" className="rounded border border-slate-300 px-3 py-2" />
          <input name="location" placeholder="Location" className="rounded border border-slate-300 px-3 py-2" />
          <input name="category" placeholder="Category" className="rounded border border-slate-300 px-3 py-2" />
          <input name="description" placeholder="Description" className="rounded border border-slate-300 px-3 py-2 md:col-span-2" />
          <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-white md:col-span-2">Create Listing</button>
        </form>
        <BazaarClient currentUserId={session.user.id} initialListings={listings.map((listing) => ({
          id: listing.id,
          title: listing.title,
          description: listing.description,
          price: listing.price,
          currency: listing.currency,
          location: listing.location,
          category: listing.category,
          seller: { id: listing.seller.id, username: listing.seller.username },
        }))} />
      </section>
    </AppShell>
  );
}
