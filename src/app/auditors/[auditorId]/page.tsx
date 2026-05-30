import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";

function parseStories(raw: string | null | undefined): Array<{ title: string; body: string; attachments: string[] }> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      title: String((item as { title?: string })?.title ?? "").trim(),
      body: String((item as { body?: string })?.body ?? "").trim(),
      attachments: Array.isArray((item as { attachments?: unknown[] })?.attachments)
        ? (item as { attachments?: unknown[] }).attachments!.map((v) => String(v)).filter(Boolean)
        : [],
    }));
  } catch {
    return [];
  }
}

export default async function AuditorProfilePage({ params }: { params: { auditorId: string } }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const listing = await prisma.auditorListing.findUnique({
    where: { id: params.auditorId },
    include: { user: { select: { username: true } }, media: true },
  });
  if (!listing) notFound();

  const stories = parseStories(listing.successStoriesJson);

  return (
    <AppShell>
      <section className="card space-y-3 p-4">
        <Link href="/auditors" className="text-sm underline">Back to Find an Auditor</Link>
        <h1 className="text-xl font-semibold">{listing.displayName}</h1>
        <p className="text-sm text-slate-400">{listing.classLevel} • @{listing.user.username}</p>
        <p className="text-sm text-slate-300">{listing.city || ""} {listing.state || ""} {listing.country || ""}</p>
        <p className="text-sm text-slate-300">{listing.travels ? "Travels: Yes" : "Travels: No"} • {listing.lookingForPcs ? "Looking for PCs" : "Not currently looking for PCs"}</p>
        {listing.trainedAt ? <p className="text-sm">Trained at: {listing.trainedAt}</p> : null}
        {listing.credentials ? <p className="text-sm">Credentials: {listing.credentials}</p> : null}
        {listing.specialtyCourses ? <p className="text-sm">Specialty courses: {listing.specialtyCourses}</p> : null}
        {listing.services ? <p className="text-sm">Services: {listing.services}</p> : null}
        {listing.bio ? <p className="text-sm">{listing.bio}</p> : null}

        {listing.media.length ? (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {listing.media.map((item) => (
              <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="rounded border border-[var(--border)] p-2 text-xs underline">
                Media file
              </a>
            ))}
          </div>
        ) : null}

        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Success Stories</h2>
          {stories.length ? stories.map((story, index) => (
            <article key={`${story.title}-${index}`} className="rounded border border-[var(--border)] p-3">
              <p className="font-medium">{story.title || `Story ${index + 1}`}</p>
              {story.body ? <p className="text-sm text-slate-300">{story.body}</p> : null}
              {story.attachments.length ? (
                <div className="mt-2 space-y-1">
                  {story.attachments.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" className="block text-xs underline">
                      Attachment
                    </a>
                  ))}
                </div>
              ) : null}
            </article>
          )) : <p className="text-sm text-slate-400">No success stories yet.</p>}
        </div>
      </section>
    </AppShell>
  );
}

