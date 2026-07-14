import { ScientologyVisibility } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { prisma } from "@/lib/platform/db";
import { parseScientologySelections } from "@/modules/my-scientology/types";

function BridgeResumeSection({
  emptyLabel,
  groups,
  headline,
  title
}: {
  emptyLabel: string;
  groups: Array<{ items: string[]; title: string }>;
  headline?: string | null;
  title: string;
}) {
  const hasGroups = groups.some((group) => group.items.length > 0);

  return (
    <section className="surface grid gap-4 rounded-md p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Primary Bridge</p>
        <h2 className="mt-1 text-2xl font-semibold text-[var(--gold)]">{title}</h2>
        {headline ? <p className="mt-3 rounded-md border border-[var(--line)] bg-black/20 px-4 py-3 text-lg font-semibold">{headline}</p> : null}
      </div>
      {hasGroups ? (
        <div className="grid gap-4">
          {groups.map((group) =>
            group.items.length > 0 ? (
              <div className="rounded-md border border-[var(--line)] bg-black/10 p-4" key={group.title}>
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">{group.title}</h3>
                <ul className="resume-bullet-list mt-3">
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null
          )}
        </div>
      ) : !headline ? (
        <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-[var(--muted)]">{emptyLabel}</p>
      ) : null}
    </section>
  );
}

function SecondaryActionList({ items, title }: { items: string[]; title: string }) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-md border border-[var(--line)] bg-black/10 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">{title}</h3>
      <ul className="resume-bullet-list mt-3">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function SummaryItem({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;

  return (
    <div className="rounded-md border border-[var(--line)] bg-black/10 p-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</dt>
      <dd className="mt-2 text-base font-semibold text-[var(--text)]">{value}</dd>
    </div>
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
  const lastServiceDate = profile.lastServiceAt
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(profile.lastServiceAt)
    : null;

  return (
    <AppShell>
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">My Scientology</p>
        <h1 className="mt-3 text-3xl font-semibold">{user.profile?.displayName ?? user.username}</h1>
        <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">Member-visible Scientology summary formatted as a training and processing resume.</p>
        <dl className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryItem label="Classification" value={profile.classification} />
          <SummaryItem label="Current org" value={profile.orgName} />
          <SummaryItem label="Last service" value={profile.lastServiceName} />
          <SummaryItem label="Last service date" value={lastServiceDate} />
        </dl>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <BridgeResumeSection
          emptyLabel="No training items have been listed yet."
          groups={[
            { title: "Course completions", items: selections.courseCompletions },
            { title: "Technical courses", items: selections.technicalCourses },
            { title: "Technical specialist courses", items: selections.specialistCourses }
          ]}
          headline={profile.trainingLevel}
          title="Training"
        />
        <BridgeResumeSection
          emptyLabel="No processing items have been listed yet."
          groups={[{ title: "Additional processing services", items: selections.additionalProcessing }]}
          headline={profile.processingStatus}
          title="Processing"
        />
      </div>

      <section className="surface mt-5 rounded-md p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Non-primary Bridge actions</p>
        <h2 className="mt-1 text-2xl font-semibold text-[var(--gold)]">Other services and notes</h2>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <SecondaryActionList items={selections.introServices} title="Introductory services" />
          {profile.educationNotes ? (
            <section className="rounded-md border border-[var(--line)] bg-black/10 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Education notes</h3>
              <p className="mt-3 whitespace-pre-wrap leading-7 text-[var(--muted)]">{profile.educationNotes}</p>
            </section>
          ) : null}
          {selections.introServices.length === 0 && !profile.educationNotes ? (
            <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-[var(--muted)] xl:col-span-2">No non-primary Bridge actions or notes have been listed yet.</p>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}
