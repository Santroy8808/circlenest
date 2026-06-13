import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminUser } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { canCreateWritersStudio, resolveProductionZoneAccess } from "@/lib/policy/production-zone";
import { resolveUserAccessPolicy } from "@/lib/policy/tier-policy";
import { serializeWritersStudioProject, serializeWritersStudioProjects } from "@/lib/writers-studio/writers-studio";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { subscriptionTier: true, role: true, iasStatus: true },
  });
  const isAdmin = await isAdminUser(session.user.id);
  const isInvitedCreator = Boolean(user?.iasStatus && user.iasStatus.toUpperCase() === "INVITED_CREATOR");
  const access = resolveProductionZoneAccess(user?.subscriptionTier, isInvitedCreator);
  const canCreate = isAdmin || canCreateWritersStudio(user?.subscriptionTier, isInvitedCreator);

  const [ownProjects, publicProjects] = await Promise.all([
    prisma.writerStudioProject.findMany({
      where: { ownerId: session.user.id },
      include: {
        owner: { select: { id: true, username: true, fullName: true } },
        _count: { select: { articles: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.writerStudioProject.findMany({
      where: { isPublic: true, NOT: { ownerId: session.user.id } },
      include: {
        owner: { select: { id: true, username: true, fullName: true } },
        _count: { select: { articles: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return NextResponse.json({
    access: {
      ...access,
      canCreate,
    },
    ownProjects: serializeWritersStudioProjects(ownProjects),
    publicProjects: serializeWritersStudioProjects(publicProjects),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { subscriptionTier: true, role: true, iasStatus: true },
  });
  const isAdmin = await isAdminUser(session.user.id);
  const isInvitedCreator = Boolean(user?.iasStatus && user.iasStatus.toUpperCase() === "INVITED_CREATOR");
  if (!isAdmin && !canCreateWritersStudio(user?.subscriptionTier, isInvitedCreator)) {
    return NextResponse.json({ error: "Writers Corner creation is locked." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    summary?: string | null;
    genre?: string | null;
    format?: string | null;
  };

  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "Project title is required." }, { status: 400 });

  const accessTier = resolveUserAccessPolicy(user).tier;

  const project = await prisma.writerStudioProject.create({
    data: {
      ownerId: session.user.id,
      title,
      summary: String(body.summary ?? "").trim() || null,
      genre: String(body.genre ?? "").trim() || null,
      format: String(body.format ?? "").trim() || null,
      accessTier,
      isPublic: true,
    },
    include: {
      owner: { select: { id: true, username: true, fullName: true } },
      articles: { orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }] },
      _count: { select: { articles: true } },
    },
  });

  return NextResponse.json({ ok: true, project: serializeWritersStudioProject(project) });
}
