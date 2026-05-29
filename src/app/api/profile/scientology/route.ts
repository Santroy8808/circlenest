import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

const scientologySchema = z.object({
  trainingLevel: z.string().max(120).optional().default(""),
  caseLevel: z.string().max(120).optional().default(""),
  successStory: z.string().max(6000).optional().default(""),
  achievements: z.string().max(6000).optional().default(""),
  goals: z.string().max(6000).optional().default(""),
  projects: z.string().max(6000).optional().default(""),
  visible: z.boolean().optional().default(false),
});

function clean(value: string): string | null {
  const trimmed = value.replace(/[<>]/g, "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = scientologySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid form input." }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true, fullName: true },
  });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const payload = parsed.data;
  const profile = await prisma.profile.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      displayName: user.fullName?.trim() || user.username,
      scientologyTrainingLevel: clean(payload.trainingLevel),
      scientologyCaseLevel: clean(payload.caseLevel),
      scientologySuccessStory: clean(payload.successStory),
      scientologyAchievements: clean(payload.achievements),
      scientologyGoals: clean(payload.goals),
      scientologyProjects: clean(payload.projects),
      scientologyVisible: payload.visible,
    },
    update: {
      scientologyTrainingLevel: clean(payload.trainingLevel),
      scientologyCaseLevel: clean(payload.caseLevel),
      scientologySuccessStory: clean(payload.successStory),
      scientologyAchievements: clean(payload.achievements),
      scientologyGoals: clean(payload.goals),
      scientologyProjects: clean(payload.projects),
      scientologyVisible: payload.visible,
    },
    select: {
      scientologyTrainingLevel: true,
      scientologyCaseLevel: true,
      scientologySuccessStory: true,
      scientologyAchievements: true,
      scientologyGoals: true,
      scientologyProjects: true,
      scientologyVisible: true,
    },
  });

  return NextResponse.json(profile);
}

