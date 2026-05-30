import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";

export default async function JobsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const jobs = await prisma.jobListing.findMany({
    where: { status: "ACTIVE" },
    include: { creator: { select: { username: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <h1 className="text-xl font-semibold">Hiring Board</h1>
        <form
          action={async (formData) => {
            "use server";
            const { auth } = await import("@/auth");
            const { prisma } = await import("@/lib/db/prisma");
            const current = await auth();
            if (!current?.user?.id) return;
            const companyName = String(formData.get("companyName") ?? "").trim();
            const title = String(formData.get("title") ?? "").trim();
            const duties = String(formData.get("duties") ?? "").trim();
            if (!companyName || !title || !duties) return;
            await prisma.jobListing.create({
              data: {
                creatorId: current.user.id,
                companyName,
                title,
                duties,
                requirements: String(formData.get("requirements") ?? "").trim() || null,
                salaryMin: String(formData.get("salaryMin") ?? "").trim() ? Number(formData.get("salaryMin")) : null,
                salaryMax: String(formData.get("salaryMax") ?? "").trim() ? Number(formData.get("salaryMax")) : null,
                location: String(formData.get("location") ?? "").trim() || null,
                employmentType: String(formData.get("employmentType") ?? "").trim() || null,
              },
            });
          }}
          className="grid gap-2 md:grid-cols-2"
        >
          <input name="companyName" placeholder="Company name" className="rounded border px-3 py-2" required />
          <input name="title" placeholder="Job title" className="rounded border px-3 py-2" required />
          <input name="location" placeholder="Location" className="rounded border px-3 py-2" />
          <input name="employmentType" placeholder="Type (Full-time, Contract...)" className="rounded border px-3 py-2" />
          <input name="salaryMin" type="number" step="0.01" placeholder="Salary min" className="rounded border px-3 py-2" />
          <input name="salaryMax" type="number" step="0.01" placeholder="Salary max" className="rounded border px-3 py-2" />
          <textarea name="duties" placeholder="Duties" className="rounded border px-3 py-2 md:col-span-2" required />
          <textarea name="requirements" placeholder="Requirements" className="rounded border px-3 py-2 md:col-span-2" />
          <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-white md:col-span-2">Post Job</button>
        </form>
        <div className="space-y-2">
          {jobs.map((job) => (
            <article key={job.id} className="rounded border border-[var(--border)] p-3">
              <p className="font-medium">{job.title}</p>
              <p className="text-sm text-slate-500">{job.companyName} • {job.location || "No location"}</p>
              <p className="text-sm">{job.duties}</p>
              <p className="text-xs text-slate-500">by @{job.creator.username}</p>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

