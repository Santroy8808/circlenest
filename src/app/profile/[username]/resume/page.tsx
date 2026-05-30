import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { ResumePrintButton } from "@/components/profile/resume-print-button";
import { prisma } from "@/lib/db/prisma";
import { parseScientologyChecklist } from "@/lib/profile/scientology";
import { parseResumeJson } from "@/lib/profile/resume";

export default async function PublicResumePage({ params }: { params: { username: string } }) {
  const session = await auth();
  const user = await prisma.user.findUnique({
    where: { username: params.username },
    select: {
      id: true,
      username: true,
      profile: {
        select: {
          displayName: true,
          resumeJson: true,
          resumeVisible: true,
          scientologyTrainingLevel: true,
          scientologyCaseLevel: true,
          scientologyAdditionalCoursesJson: true,
          scientologyIncludeOnResume: true,
        },
      },
    },
  });
  if (!user) notFound();

  const isOwner = session?.user?.id === user.id;
  if (!isOwner && !user.profile?.resumeVisible) notFound();

  const resume = parseResumeJson(user.profile?.resumeJson);
  const name = resume.basics.fullName || user.profile?.displayName || user.username;
  const basicsLine = [resume.basics.email, resume.basics.phone, resume.basics.location, resume.basics.website].filter(Boolean).join(" | ");
  const scientologyItems = [
    user.profile?.scientologyTrainingLevel ? `Training: ${user.profile.scientologyTrainingLevel}` : null,
    user.profile?.scientologyCaseLevel ? `Processing: ${user.profile.scientologyCaseLevel}` : null,
    ...parseScientologyChecklist(user.profile?.scientologyAdditionalCoursesJson),
  ].filter((value): value is string => Boolean(value));

  return (
    <AppShell>
      <article className="card p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-strong)]">{name}</h1>
            {resume.basics.headline ? <p className="text-sm text-slate-300">{resume.basics.headline}</p> : null}
            {basicsLine ? <p className="mt-1 text-xs text-slate-400">{basicsLine}</p> : null}
          </div>
          <div className="flex flex-col items-end gap-1">
            <ResumePrintButton />
            <Link href={`/profile/${user.username}`} className="text-sm underline">
              Back to profile
            </Link>
          </div>
        </div>

        {resume.summary ? <Section title="Professional Summary"><p className="whitespace-pre-wrap text-sm">{resume.summary}</p></Section> : null}
        {resume.experience.some((item) => Object.values(item).some(Boolean)) ? (
          <Section title="Experience">
            <EntryList entries={resume.experience} />
          </Section>
        ) : null}
        {resume.education.some((item) => Object.values(item).some(Boolean)) ? (
          <Section title="Education">
            <EntryList entries={resume.education} />
          </Section>
        ) : null}
        {resume.projects.some((item) => Object.values(item).some(Boolean)) ? (
          <Section title="Projects">
            <div className="space-y-3">
              {resume.projects.map((project, index) => (
                <div key={`${project.name}-${index}`} className="rounded-md bg-[#0e1728] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-[var(--text-strong)]">{project.name || "Project"}</p>
                    {project.role ? <p className="text-xs text-slate-300">{project.role}</p> : null}
                  </div>
                  {project.url ? <p className="text-xs text-slate-400">{project.url}</p> : null}
                  {project.details ? <p className="mt-1 whitespace-pre-wrap text-sm">{project.details}</p> : null}
                </div>
              ))}
            </div>
          </Section>
        ) : null}
        {resume.skills.length > 0 ? (
          <Section title="Skills">
            <div className="flex flex-wrap gap-1">
              {resume.skills.map((skill) => (
                <span key={skill} className="rounded bg-[#1d2637] px-2 py-1 text-xs">
                  {skill}
                </span>
              ))}
            </div>
          </Section>
        ) : null}
        {user.profile?.scientologyIncludeOnResume && scientologyItems.length > 0 ? (
          <Section title="Scientology">
            <div className="flex flex-wrap gap-1">
              {scientologyItems.map((item) => (
                <span key={item} className="rounded bg-[#1d2637] px-2 py-1 text-xs">
                  {item}
                </span>
              ))}
            </div>
          </Section>
        ) : null}
      </article>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 border-t border-[var(--border)] pt-3">
      <h2 className="mb-2 text-base font-semibold text-[var(--text-strong)]">{title}</h2>
      {children}
    </section>
  );
}

function EntryList({ entries }: { entries: { organization: string; title: string; startDate: string; endDate: string; details: string }[] }) {
  return (
    <div className="space-y-3">
      {entries.map((entry, index) => (
        <div key={`${entry.organization}-${index}`} className="rounded-md bg-[#0e1728] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-[var(--text-strong)]">{entry.title || entry.organization || "Entry"}</p>
            <p className="text-xs text-slate-300">{[entry.startDate, entry.endDate].filter(Boolean).join(" - ")}</p>
          </div>
          {entry.organization ? <p className="text-xs text-slate-400">{entry.organization}</p> : null}
          {entry.details ? <p className="mt-1 whitespace-pre-wrap text-sm">{entry.details}</p> : null}
        </div>
      ))}
    </div>
  );
}
