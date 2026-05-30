import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import {
  normalizeScientologyChecklist,
  normalizeScientologyProcessing,
  normalizeScientologyTraining,
} from "@/lib/profile/scientology";
import { secureAreaLockedResponse } from "@/lib/security/secure-area-guards";

const scientologySchema = z.object({
  trainingLevel: z.string().max(200).optional().default(""),
  processingLevel: z.string().max(200).optional().default(""),
  additionalCourses: z.array(z.string()).optional().default([]),
  visible: z.boolean().optional().default(false),
  includeOnResume: z.boolean().optional().default(false),
});

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const locked = secureAreaLockedResponse(session.user.id);
  if (locked) return locked;

  const parsed = scientologySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid form input." }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true, fullName: true },
  });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const payload = parsed.data;
  const trainingLevel = normalizeScientologyTraining(payload.trainingLevel);
  const processingLevel = normalizeScientologyProcessing(payload.processingLevel);
  const additionalCourses = normalizeScientologyChecklist(payload.additionalCourses);
  const profile = await prisma.profile.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      displayName: user.fullName?.trim() || user.username,
      scientologyTrainingLevel: trainingLevel,
      scientologyCaseLevel: processingLevel,
      scientologyAdditionalCoursesJson: additionalCourses.length ? JSON.stringify(additionalCourses) : null,
      scientologyIncludeOnResume: payload.includeOnResume,
      scientologyVisible: payload.visible,
    },
    update: {
      scientologyTrainingLevel: trainingLevel,
      scientologyCaseLevel: processingLevel,
      scientologyAdditionalCoursesJson: additionalCourses.length ? JSON.stringify(additionalCourses) : null,
      scientologyIncludeOnResume: payload.includeOnResume,
      scientologyVisible: payload.visible,
    },
    select: {
      scientologyTrainingLevel: true,
      scientologyCaseLevel: true,
      scientologyAdditionalCoursesJson: true,
      scientologyIncludeOnResume: true,
      scientologyVisible: true,
    },
  });

  return NextResponse.json(profile);
}
