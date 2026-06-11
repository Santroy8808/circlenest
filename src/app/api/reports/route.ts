import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { OPEN_REPORT_STATUSES, REPORT_REASONS, REPORT_TARGET_TYPES } from "@/lib/reports/report-types";
import { z } from "zod";

const reportSchema = z.object({
  targetType: z.string().trim().min(1),
  targetId: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  details: z.string().trim().max(2000).optional().nullable(),
});

async function targetExists(targetType: string, targetId: string): Promise<boolean> {
  switch (targetType) {
    case "POST":
      return Boolean(await prisma.post.findUnique({ where: { id: targetId }, select: { id: true } }));
    case "COMMENT":
      return Boolean(await prisma.comment.findUnique({ where: { id: targetId }, select: { id: true } }));
    case "PHOTO":
      return Boolean(await prisma.photo.findUnique({ where: { id: targetId }, select: { id: true } }));
    case "PHOTO_COMMENT":
      return Boolean(await prisma.photoComment.findUnique({ where: { id: targetId }, select: { id: true } }));
    case "GROUP":
      return Boolean(await prisma.group.findUnique({ where: { id: targetId }, select: { id: true } }));
    case "EVENT":
      return Boolean(await prisma.event.findUnique({ where: { id: targetId }, select: { id: true } }));
    case "BAZAAR_LISTING":
      return Boolean(await prisma.bazaarListing.findUnique({ where: { id: targetId }, select: { id: true } }));
    case "JOB_LISTING":
      return Boolean(await prisma.jobListing.findUnique({ where: { id: targetId }, select: { id: true } }));
    case "FUNDRAISER":
      return Boolean(await prisma.fundraiser.findUnique({ where: { id: targetId }, select: { id: true } }));
    case "AUDITOR_LISTING":
      return Boolean(await prisma.auditorListing.findUnique({ where: { id: targetId }, select: { id: true } }));
    case "USER":
      return Boolean(await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } }));
    default:
      return false;
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid report" }, { status: 400 });
  }

  const targetType = parsed.data.targetType.toUpperCase();
  const reason = parsed.data.reason.toUpperCase();
  const details = parsed.data.details?.trim() || null;
  const targetId = parsed.data.targetId.trim();

  if (!REPORT_TARGET_TYPES.includes(targetType as (typeof REPORT_TARGET_TYPES)[number])) {
    return NextResponse.json({ error: "Invalid target" }, { status: 400 });
  }

  if (!REPORT_REASONS.includes(reason as (typeof REPORT_REASONS)[number])) {
    return NextResponse.json({ error: "Invalid reason" }, { status: 400 });
  }

  if (!(await targetExists(targetType, targetId))) {
    return NextResponse.json({ error: "Target not found" }, { status: 404 });
  }

  const duplicate = await prisma.contentReport.findFirst({
    where: {
      reporterId: session.user.id,
      targetType,
      targetId,
      reason,
      status: { in: [...OPEN_REPORT_STATUSES] },
    },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json({ error: "Already reported" }, { status: 409 });
  }

  const report = await prisma.contentReport.create({
    data: {
      reporterId: session.user.id,
      targetType,
      targetId,
      reason,
      details,
    },
    select: {
      id: true,
      targetType: true,
      targetId: true,
      reason: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json(report, { status: 201 });
}
