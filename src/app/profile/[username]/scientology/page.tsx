import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { prisma } from "@/lib/db/prisma";
import { parseScientologyChecklist } from "@/lib/profile/scientology";

export default async function PublicScientologyPage({ params }: { params: { username: string } }) {
  const session = await auth();
  const user = await prisma.user.findUnique({
    where: { username: params.username },
    select: {
      id: true,
      username: true,
      profile: {
        select: {
          displayName: true,
          scientologyTrainingLevel: true,
          scientologyCaseLevel: true,
          scientologyAdditionalCoursesJson: true,
          scientologyIncludeOnResume: true,
          scientologyVisible: true,
        },
      },
    },
  });

  if (!user) notFound();

  const isOwner = session?.user?.id === user.id;
  if (!isOwner && !user.profile?.scientologyVisible) notFound();

  const profileName = user.profile?.displayName || user.username;
  const additionalCourses = parseScientologyChecklist(user.profile?.scientologyAdditionalCoursesJson);
  return (
    <AppShell>
      <div className="card p-3">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-[var(--text-strong)]">{profileName} - My Scientology</h1>
          <Link href={`/profile/${user.username}`} className="text-sm underline">
            Back to profile
          </Link>
        </div>

        <div className="grid gap-2 text-sm">
          <Row label="Training level" value={user.profile?.scientologyTrainingLevel} />
          <Row label="Processing level" value={user.profile?.scientologyCaseLevel} />
          <Row
            label="Include on resume"
            value={user.profile?.scientologyIncludeOnResume ? "Yes" : "No"}
          />
          <ChecklistRow label="Additional courses and qualifications" values={additionalCourses} />
        </div>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <p>
      <span className="font-semibold text-[var(--text-strong)]">{label}:</span> {value || "Not shared yet."}
    </p>
  );
}

function ChecklistRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="rounded-md border border-[var(--border)] p-2">
      <p className="mb-1 font-semibold text-[var(--text-strong)]">{label}</p>
      {values.length ? (
        <div className="flex flex-wrap gap-1">
          {values.map((value) => (
            <span key={value} className="rounded bg-[#1d2637] px-2 py-1 text-xs text-slate-100">
              {value}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-slate-200">Not shared yet.</p>
      )}
    </div>
  );
}
