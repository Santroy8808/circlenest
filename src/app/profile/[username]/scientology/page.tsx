import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { prisma } from "@/lib/db/prisma";

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
          scientologySuccessStory: true,
          scientologyAchievements: true,
          scientologyGoals: true,
          scientologyProjects: true,
          scientologyVisible: true,
        },
      },
    },
  });

  if (!user) notFound();

  const isOwner = session?.user?.id === user.id;
  if (!isOwner && !user.profile?.scientologyVisible) notFound();

  const profileName = user.profile?.displayName || user.username;
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
          <Row label="Case level" value={user.profile?.scientologyCaseLevel} />
          <LongRow label="Success story" value={user.profile?.scientologySuccessStory} />
          <LongRow label="Achievements" value={user.profile?.scientologyAchievements} />
          <LongRow label="Goals" value={user.profile?.scientologyGoals} />
          <LongRow label="Projects" value={user.profile?.scientologyProjects} />
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

function LongRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-md border border-[var(--border)] p-2">
      <p className="mb-1 font-semibold text-[var(--text-strong)]">{label}</p>
      <p className="whitespace-pre-wrap text-slate-200">{value || "Not shared yet."}</p>
    </div>
  );
}

