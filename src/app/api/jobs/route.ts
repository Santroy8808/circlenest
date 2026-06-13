import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { serializeAdPlacements } from "@/lib/ads/ads";
import { canCreateHiringPost } from "@/lib/policy/tier-policy";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";

function isSafeJobImageUrl(value: string) {
  return value.startsWith("/uploads/") || value.startsWith("/api/media/");
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const location = (searchParams.get("location") ?? "").trim();
  const employmentType = (searchParams.get("employmentType") ?? "").trim();
  const minSalary = Number((searchParams.get("minSalary") ?? "").trim());
  const maxSalary = Number((searchParams.get("maxSalary") ?? "").trim());

  const and: Record<string, unknown>[] = [];
  if (q) {
    and.push({
      OR: [
        { companyName: { contains: q } },
        { title: { contains: q } },
        { duties: { contains: q } },
        { requirements: { contains: q } },
      ],
    });
  }
  if (location) and.push({ location: { contains: location } });
  if (employmentType) and.push({ employmentType: { contains: employmentType } });
  if (!Number.isNaN(minSalary)) and.push({ OR: [{ salaryMin: { gte: minSalary } }, { salaryMax: { gte: minSalary } }] });
  if (!Number.isNaN(maxSalary)) and.push({ OR: [{ salaryMax: { lte: maxSalary } }, { salaryMin: { lte: maxSalary } }] });

  const jobs = await prisma.jobListing.findMany({
    where: { status: "ACTIVE", ...(and.length ? { AND: and } : {}) },
    include: {
      creator: { select: { id: true, username: true } },
      adPlacements: {
        include: { creator: { select: { id: true, username: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(
    jobs.map((job) => ({
      ...job,
      ads: serializeAdPlacements(job.adPlacements),
    })),
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, subscriptionTier: true },
  });
  const policy = resolveMemberAccessPolicy(session.user.id, user);
  if (!canCreateHiringPost(policy)) {
    return NextResponse.json({ error: "Hiring post creation is not allowed on this tier." }, { status: 403 });
  }

  const body = (await request.json()) as {
    companyName?: string;
    title?: string;
    duties?: string;
    requirements?: string;
    salaryMin?: number | string;
    salaryMax?: number | string;
    location?: string;
    employmentType?: string;
    imageUrl?: string | null;
  };
  const companyName = String(body.companyName ?? "").trim();
  const title = String(body.title ?? "").trim();
  const duties = String(body.duties ?? "").trim();
  if (!companyName || !title || !duties) return NextResponse.json({ error: "companyName, title, and duties are required" }, { status: 400 });
  const imageUrl = String(body.imageUrl ?? "").trim();
  if (imageUrl && !isSafeJobImageUrl(imageUrl)) {
    return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
  }

  const created = await prisma.jobListing.create({
    data: {
      creatorId: session.user.id,
      companyName,
      title,
      duties,
      requirements: String(body.requirements ?? "").trim() || null,
      salaryMin: body.salaryMin !== undefined ? Number(body.salaryMin) : null,
      salaryMax: body.salaryMax !== undefined ? Number(body.salaryMax) : null,
      location: String(body.location ?? "").trim() || null,
      employmentType: String(body.employmentType ?? "").trim() || null,
      imageUrl: imageUrl || null,
    },
    include: { creator: { select: { id: true, username: true } } },
  });
  return NextResponse.json(created);
}



