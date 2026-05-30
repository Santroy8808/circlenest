import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { createEmptyResumeData, sanitizeResumeData, type ResumeData } from "@/lib/profile/resume";
import { secureAreaLockedResponse } from "@/lib/security/secure-area-guards";

const resumeEntrySchema = z.object({
  organization: z.string().optional().default(""),
  title: z.string().optional().default(""),
  startDate: z.string().optional().default(""),
  endDate: z.string().optional().default(""),
  details: z.string().optional().default(""),
});

const resumeProjectSchema = z.object({
  name: z.string().optional().default(""),
  role: z.string().optional().default(""),
  url: z.string().optional().default(""),
  details: z.string().optional().default(""),
});

const resumeSchema = z.object({
  resume: z.object({
    basics: z.object({
      fullName: z.string().optional().default(""),
      headline: z.string().optional().default(""),
      email: z.string().optional().default(""),
      phone: z.string().optional().default(""),
      location: z.string().optional().default(""),
      website: z.string().optional().default(""),
    }),
    summary: z.string().optional().default(""),
    experience: z.array(resumeEntrySchema).optional().default([]),
    education: z.array(resumeEntrySchema).optional().default([]),
    projects: z.array(resumeProjectSchema).optional().default([]),
    skills: z.array(z.string()).optional().default([]),
  }),
  visible: z.boolean().optional().default(false),
});

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const locked = secureAreaLockedResponse(session.user.id);
  if (locked) return locked;

  const parsed = resumeSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid resume data." }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true, fullName: true },
  });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const resumePayload: ResumeData = sanitizeResumeData({
    ...createEmptyResumeData(),
    ...parsed.data.resume,
    basics: { ...createEmptyResumeData().basics, ...parsed.data.resume.basics },
  });

  const profile = await prisma.profile.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      displayName: user.fullName?.trim() || user.username,
      resumeJson: JSON.stringify(resumePayload),
      resumeVisible: parsed.data.visible,
    },
    update: {
      resumeJson: JSON.stringify(resumePayload),
      resumeVisible: parsed.data.visible,
    },
    select: { resumeJson: true, resumeVisible: true },
  });

  return NextResponse.json(profile);
}
