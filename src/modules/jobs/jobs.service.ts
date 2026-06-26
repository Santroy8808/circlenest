import { JobCategory, JobListingStatus, Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";
import {
  createJobListingSchema,
  employmentTypeLabels,
  jobCategoryLabels,
  type JobListingCardView,
  type JobListingDetailView
} from "@/modules/jobs/types";

const MODULE_KEY = "jobs";
const JOBS_DB_TIMEOUT_MS = 2500;

function withJobsDbTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${operation} timed out`)), JOBS_DB_TIMEOUT_MS);
    })
  ]);
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function uniqueJobSlug(title: string) {
  const base = slugify(title) || "job";
  let candidate = base;
  let index = 2;

  while (await prisma.jobListing.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${index}`;
    index += 1;
  }

  return candidate;
}

function profileName(user: { username: string; profile: { displayName: string | null } | null }) {
  return user.profile?.displayName ?? user.username;
}

async function getViewerRole(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  return user?.role ?? UserRole.MEMBER;
}

export async function viewerCanCreateJob(userId: string) {
  const role = await getViewerRole(userId);
  if (role === UserRole.ADMIN) return true;
  return (await canUserAccessFeature(userId, "jobs.createListing")).allowed;
}

type JobPayload = Prisma.JobListingGetPayload<{ include: { employer: { include: { profile: true } } } }>;

function toJobCardView(job: JobPayload): JobListingCardView {
  return {
    id: job.id,
    slug: job.slug,
    title: job.title,
    companyName: job.companyName,
    summary: job.summary,
    category: job.category,
    categoryLabel: jobCategoryLabels[job.category],
    employmentType: job.employmentType,
    employmentTypeLabel: employmentTypeLabels[job.employmentType],
    location: job.location,
    remote: job.remote,
    compensation: job.compensation,
    status: job.status,
    createdAt: job.createdAt.toISOString(),
    employer: {
      id: job.employer.id,
      username: job.employer.username,
      displayName: profileName(job.employer),
      avatarUrl: job.employer.profile?.avatarUrl
    }
  };
}

export async function listJobListings(input?: { query?: string | null; category?: string | null }) {
  const query = input?.query?.trim();
  const category = input?.category && input.category in JobCategory ? (input.category as JobCategory) : null;
  const jobs = await withJobsDbTimeout(
    prisma.jobListing.findMany({
      where: {
        status: JobListingStatus.ACTIVE,
        ...(category ? { category } : {}),
        ...(query
          ? {
              OR: [
                { title: { contains: query, mode: "insensitive" } },
                { companyName: { contains: query, mode: "insensitive" } },
                { description: { contains: query, mode: "insensitive" } }
              ]
            }
          : {})
      },
      include: {
        employer: {
          include: {
            profile: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 80
    }),
    "job listings lookup"
  );

  return jobs.map(toJobCardView);
}

export async function safeListJobListings(input?: { query?: string | null; category?: string | null }) {
  try {
    return await listJobListings(input);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not list jobs.", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return [];
  }
}

export async function createJobListing(userId: string, input: unknown) {
  const parsed = createJobListingSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid job." };
  }

  if (!(await viewerCanCreateJob(userId))) {
    return { ok: false as const, error: "This account cannot create job listings." };
  }

  const job = await prisma.jobListing.create({
    data: {
      slug: await uniqueJobSlug(parsed.data.title),
      employerUserId: userId,
      title: parsed.data.title,
      companyName: parsed.data.companyName || null,
      summary: parsed.data.summary || null,
      description: parsed.data.description,
      category: parsed.data.category,
      employmentType: parsed.data.employmentType,
      location: parsed.data.location || null,
      remote: parsed.data.remote,
      compensation: parsed.data.compensation || null,
      contactEmail: parsed.data.contactEmail || null,
      contactInstructions: parsed.data.contactInstructions || null
    }
  });

  await diagnostics.info(MODULE_KEY, "Job listing created.", {
    userId,
    jobListingId: job.id
  });

  return { ok: true as const, job };
}

export async function getJobListingDetail(viewerUserId: string, listingIdOrSlug: string) {
  const job = await prisma.jobListing.findFirst({
    where: {
      OR: [{ id: listingIdOrSlug }, { slug: listingIdOrSlug }],
      status: {
        not: JobListingStatus.ARCHIVED
      }
    },
    include: {
      employer: {
        include: {
          profile: true
        }
      }
    }
  });

  if (!job) {
    return { ok: false as const, error: "Job listing not found." };
  }

  const role = await getViewerRole(viewerUserId);
  const canPromote = role === UserRole.ADMIN || job.employerUserId === viewerUserId || (await canUserAccessFeature(viewerUserId, "ads.createGeneral")).allowed;
  const detail: JobListingDetailView = {
    ...toJobCardView(job),
    description: job.description,
    contactEmail: job.contactEmail,
    contactInstructions: job.contactInstructions,
    viewerCanManage: role === UserRole.ADMIN || job.employerUserId === viewerUserId,
    viewerCanPromote: canPromote
  };

  return { ok: true as const, job: detail };
}

export async function safeGetJobListingDetail(viewerUserId: string, listingIdOrSlug: string) {
  try {
    return await getJobListingDetail(viewerUserId, listingIdOrSlug);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not load job listing detail.", {
      viewerUserId,
      listingIdOrSlug,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { ok: false as const, error: "Could not load job listing." };
  }
}
