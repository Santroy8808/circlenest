import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const location = (searchParams.get("location") ?? "").trim();

  const jobs = await prisma.jobListing.findMany({
    where: {
      status: "ACTIVE",
      ...(q
        ? {
            OR: [
              { companyName: { contains: q, mode: "insensitive" } },
              { title: { contains: q, mode: "insensitive" } },
              { duties: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(location ? { location: { contains: location, mode: "insensitive" } } : {}),
    },
    include: { creator: { select: { id: true, username: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(jobs);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as {
    companyName?: string;
    title?: string;
    duties?: string;
    requirements?: string;
    salaryMin?: number | string;
    salaryMax?: number | string;
    location?: string;
    employmentType?: string;
  };
  const companyName = String(body.companyName ?? "").trim();
  const title = String(body.title ?? "").trim();
  const duties = String(body.duties ?? "").trim();
  if (!companyName || !title || !duties) return NextResponse.json({ error: "companyName, title, and duties are required" }, { status: 400 });

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
    },
    include: { creator: { select: { id: true, username: true } } },
  });
  return NextResponse.json(created);
}

