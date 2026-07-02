import { ScientologyVisibility } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { prisma } from "@/lib/platform/db";
import { parseScientologySelections } from "@/modules/my-scientology/types";

function SelectionList({ items, title }: { items: string[]; title: string }) {
  if (items.length === 0) return null;

  return (
    <section className="surface rounded-md p-5">
      <h2 className="text-lg font-semibold text-[var(--gold)]">{title}</h2>
      <ul className="resume-bullet-list mt-3">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export default async function PublicScientologyPage({ params }: { params: { username: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/profile/${params.username}/scientology`);
  }

  const user = await prisma.user.findUnique({
    where: { username: params.username.trim().replace(/^@/, "").toLowerCase() },
    include: {
      profile: true,
      scientologyProfile: true
    }
  });

  const isOwner = user?.id === session.user.id;
  const profile = user?.scientologyProfile;

  if (!user || !profile || (!isOwner && profile.visibility !== ScientologyVisibility.MEMBERS)) {
    return (
      <AppShell>
        <section className="surface rounded-md p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">My Scientology</p>
          <h1 className="mt-3 text-3xl font-semibold">Not available</h1>
          <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">This member has not made their My Scientology summary visible.</p>
          <Link className="btn-secondary mt-5 inline-flex" href={`/profile/${params.username}`}>
            Back to profile
          </Link>
        </section>
      </AppShell>
    );
  }

  const selections = parseScientologySelections(profile);

  return (
    <AppShell>
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">My Scientology</p>
        <h1 className="mt-3 text-3xl font-semibold">{user.profile?.displayName ?? user.username}</h1>
        <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">Member-visible Scientology summary.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="pill rounded-full px-3 py-1 text-xs font-semibold">{profile.classification}</span>
          {profile.trainingLevel ? <span className="pill rounded-full px-3 py-1 text-xs font-semibold">{profile.trainingLevel}</span> : null}
          {profile.processingStatus ? <span className="pill rounded-full px-3 py-1 text-xs font-semibold">{profile.processingStatus}</span> : null}
          {profile.orgName ? <span className="pill rounded-full px-3 py-1 text-xs font-semibold">{profile.orgName}</span> : null}
        </div>
      </section>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <SelectionList items={selections.courseCompletions} title="Course Completions" />
        <SelectionList items={selections.introServices} title="Intro Services" />
        <SelectionList items={selections.technicalCourses} title="Technical Courses" />
        <SelectionList items={selections.specialistCourses} title="Technical Specialist Courses" />
        <SelectionList items={selections.additionalProcessing} title="Additional Processing" />
        {profile.educationNotes ? (
          <section className="surface rounded-md p-5">
            <h2 className="text-lg font-semibold text-[var(--gold)]">Education Notes</h2>
            <p className="mt-3 whitespace-pre-wrap leading-7 text-[var(--muted)]">{profile.educationNotes}</p>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
