import {
  JobCategory,
  JobListingStatus,
  MediaAssetStatus,
  MediaVisibility,
  Prisma,
  UploadIntentPurpose,
  UserRole
} from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import {
  lockReadyMediaAssetsForReference,
  withMediaAssetReferenceValidation
} from "@/lib/platform/media-asset-reference-fence";
import { isAdminRole } from "@/lib/platform/roles";
import { getR2PublicUrl } from "@/lib/platform/r2";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";
import {
  completeUploadIntent,
  consumeVerifiedUploadIntent,
  createUploadIntent
} from "@/modules/media/upload-intent.service";
import {
  completeJobImageUploadSchema,
  createJobListingSchema,
  createJobImageUploadIntentSchema,
  employmentTypeLabels,
  isJobSearchCategory,
  jobCategoryLabels,
  updateJobListingSchema,
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

type JobDatabase = typeof prisma | Prisma.TransactionClient;

async function uniqueJobSlug(title: string, database: JobDatabase = prisma) {
  const base = slugify(title) || "job";
  let candidate = base;
  let index = 2;

  while (await database.jobListing.findUnique({ where: { slug: candidate }, select: { id: true } })) {
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
  return (await canUserAccessFeature(userId, "jobs.createListing")).allowed;
}

export function canViewerPromoteJob(input: {
  viewerUserId: string;
  employerUserId: string;
  canCreateGeneralAd: boolean;
}) {
  return input.viewerUserId === input.employerUserId && input.canCreateGeneralAd;
}

async function getJobImageAccessState(userId: string) {
  const featureAccess = await canUserAccessFeature(userId, "jobs.createListing");

  if (!featureAccess.allowed) {
    return {
      allowed: false as const,
      reason: featureAccess.reason ?? "You cannot upload job listing images."
    };
  }

  return { allowed: true as const };
}

export async function createJobImageUploadIntent(userId: string, input: unknown) {
  const parsed = createJobImageUploadIntentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid image." };
  }

  const state = await getJobImageAccessState(userId);
  if (!state.allowed) return { ok: false as const, error: state.reason };

  const intent = await createUploadIntent(userId, {
    purpose: UploadIntentPurpose.JOB_LISTING,
    mimeType: parsed.data.mimeType,
    sizeBytes: parsed.data.sizeBytes,
    visibility: MediaVisibility.PUBLIC
  });

  if (!intent.ok) return intent;

  return {
    ok: true as const,
    intentId: intent.intent.id,
    uploadUrl: intent.uploadUrl,
    uploadHeaders: intent.uploadHeaders,
    storageKey: intent.intent.storageKey,
    publicUrl: getR2PublicUrl(intent.intent.storageKey),
    expiresInSeconds: intent.expiresInSeconds
  };
}

export async function completeJobImageUpload(userId: string, input: unknown) {
  const parsed = completeJobImageUploadSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid upload completion." };
  }

  const state = await getJobImageAccessState(userId);
  if (!state.allowed) return { ok: false as const, error: state.reason };

  const verified = await completeUploadIntent(userId, { intentId: parsed.data.intentId });
  if (!verified.ok) return verified;

  if (
    verified.intent.purpose !== UploadIntentPurpose.JOB_LISTING ||
    verified.intent.storageKey !== parsed.data.storageKey ||
    verified.intent.mimeType !== parsed.data.mimeType ||
    Number(verified.intent.sizeBytes) !== parsed.data.sizeBytes ||
    verified.intent.visibility !== MediaVisibility.PUBLIC
  ) {
    return { ok: false as const, error: "Upload intent does not match this job image." };
  }

  const consumed = await consumeVerifiedUploadIntent({
    ownerUserId: userId,
    intentId: parsed.data.intentId,
    purpose: UploadIntentPurpose.JOB_LISTING,
    consume: async (transaction, intent) => transaction.mediaAsset.create({
      data: {
        ownerUserId: userId,
        storageKey: intent.storageKey,
        publicUrl: getR2PublicUrl(intent.storageKey),
        mimeType: intent.declaredMimeType,
        sizeBytes: intent.declaredSizeBytes,
        originalName: parsed.data.fileName,
        status: MediaAssetStatus.READY,
        visibility: intent.visibility,
        metadata: {
          module: MODULE_KEY,
          uploadIntentId: intent.id
        }
      }
    })
  });

  if (!consumed.ok) return consumed;
  const asset = consumed.value;

  await diagnostics.info(MODULE_KEY, "Job image upload completed.", {
    userId,
    mediaAssetId: asset.id
  });

  return {
    ok: true as const,
    asset: {
      id: asset.id,
      publicUrl: asset.publicUrl
    }
  };
}

type JobPayload = Prisma.JobListingGetPayload<{
  include: {
    employer: { include: { profile: true } };
    image: true;
  };
}>;

function mediaAssetUrl(asset?: { publicUrl: string | null; storageKey: string } | null) {
  if (!asset) return null;
  return asset.publicUrl ?? getR2PublicUrl(asset.storageKey);
}

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
    imageMediaAssetId: job.imageMediaAssetId,
    imageUrl: mediaAssetUrl(job.image),
    imageOverlayText: job.imageOverlayText,
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

export type JobListingSearchInput = {
  query?: string | null;
  category?: string | null;
  location?: string | null;
};

function cleanSearchText(value?: string | null) {
  return value?.trim() || null;
}

function locationMatchesRemote(value: string) {
  return /\bremote\b/i.test(value);
}

export function buildJobListingWhere(input?: JobListingSearchInput): Prisma.JobListingWhereInput {
  const query = cleanSearchText(input?.query);
  const location = cleanSearchText(input?.location);
  const category = isJobSearchCategory(input?.category) ? input.category : null;
  const andFilters: Prisma.JobListingWhereInput[] = [];

  if (query) {
    andFilters.push({
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { companyName: { contains: query, mode: "insensitive" } },
        { summary: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
        { needs: { contains: query, mode: "insensitive" } },
        { wants: { contains: query, mode: "insensitive" } },
        { location: { contains: query, mode: "insensitive" } },
        { compensation: { contains: query, mode: "insensitive" } }
      ]
    });
  }

  if (location) {
    andFilters.push({
      OR: [
        { location: { contains: location, mode: "insensitive" } },
        ...(locationMatchesRemote(location) ? [{ remote: true }] : [])
      ]
    });
  }

  return {
    status: JobListingStatus.ACTIVE,
    ...(category ? { category } : {}),
    ...(andFilters.length ? { AND: andFilters } : {})
  };
}

export async function listJobListings(input?: JobListingSearchInput) {
  const jobs = await withJobsDbTimeout(
    prisma.jobListing.findMany({
      where: buildJobListingWhere(input),
      include: {
        employer: {
          include: {
            profile: true
          }
        },
        image: true
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

export async function safeListJobListings(input?: JobListingSearchInput) {
  try {
    return await listJobListings(input);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not list jobs.", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return [];
  }
}

export async function listOwnedJobListings(userId: string) {
  const jobs = await withJobsDbTimeout(
    prisma.jobListing.findMany({
      where: {
        employerUserId: userId,
        status: {
          not: JobListingStatus.ARCHIVED
        }
      },
      include: {
        employer: {
          include: {
            profile: true
          }
        },
        image: true
      },
      orderBy: {
        createdAt: "desc"
      }
    }),
    "owned job listings lookup"
  );

  return jobs.map(toJobCardView);
}

export async function safeListOwnedJobListings(userId: string) {
  try {
    return await listOwnedJobListings(userId);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not list owned job listings.", {
      userId,
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

  const imageMediaAssetId = parsed.data.imageMediaAssetId || null;
  const referenceValidation = await withMediaAssetReferenceValidation(() =>
    prisma.$transaction(async (transaction) => {
      await lockReadyMediaAssetsForReference(transaction, imageMediaAssetId ? [imageMediaAssetId] : [], {
        additionalUserIds: [userId]
      });

      if (imageMediaAssetId) {
        const image = await transaction.mediaAsset.findFirst({
          where: {
            id: imageMediaAssetId,
            ownerUserId: userId,
            status: MediaAssetStatus.READY,
            visibility: MediaVisibility.PUBLIC,
            mimeType: { startsWith: "image/", mode: "insensitive" }
          },
          select: { id: true }
        });

        if (!image) {
          return { ok: false as const, error: "The job image could not be found." };
        }
      }

      const job = await transaction.jobListing.create({
        data: {
          slug: await uniqueJobSlug(parsed.data.title, transaction),
          employerUserId: userId,
          title: parsed.data.title,
          companyName: parsed.data.companyName || null,
          summary: parsed.data.summary || null,
          description: parsed.data.description,
          needs: parsed.data.needs || null,
          wants: parsed.data.wants || null,
          category: parsed.data.category,
          employmentType: parsed.data.employmentType,
          location: parsed.data.location || null,
          remote: parsed.data.remote,
          compensation: parsed.data.compensation || null,
          contactEmail: parsed.data.contactEmail || null,
          contactPhone: parsed.data.contactPhone || null,
          contactInstructions: parsed.data.contactInstructions || null,
          imageMediaAssetId,
          imageOverlayText: parsed.data.imageOverlayText || null
        }
      });

      return { ok: true as const, job };
    })
  );

  if (!referenceValidation.ok) return referenceValidation;
  const creation = referenceValidation.value;
  if (!creation.ok) return creation;
  const job = creation.job;

  await diagnostics.info(MODULE_KEY, "Job listing created.", {
    userId,
    jobListingId: job.id
  });

  return { ok: true as const, job };
}

export async function updateJobListing(viewerUserId: string, listingIdOrSlug: string, input: unknown) {
  const parsed = updateJobListingSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid job." };
  }

  const listingOwner = await prisma.jobListing.findFirst({
    where: {
      OR: [{ id: listingIdOrSlug }, { slug: listingIdOrSlug }],
      status: {
        not: JobListingStatus.ARCHIVED
      }
    },
    select: {
      id: true,
      employerUserId: true
    }
  });

  if (!listingOwner) {
    return { ok: false as const, error: "Job listing not found." };
  }

  const role = await getViewerRole(viewerUserId);
  const viewerIsAdmin = isAdminRole(role);
  if (!viewerIsAdmin && listingOwner.employerUserId !== viewerUserId) {
    return { ok: false as const, error: "You cannot edit this job listing." };
  }

  const imageMediaAssetId = parsed.data.imageMediaAssetId || null;
  const allowedImageOwnerIds = viewerIsAdmin
    ? [listingOwner.employerUserId, viewerUserId]
    : [listingOwner.employerUserId];

  const referenceValidation = await withMediaAssetReferenceValidation(() =>
    prisma.$transaction(async (transaction) => {
      await lockReadyMediaAssetsForReference(transaction, imageMediaAssetId ? [imageMediaAssetId] : [], {
        additionalUserIds: allowedImageOwnerIds
      });

      if (imageMediaAssetId) {
        const image = await transaction.mediaAsset.findFirst({
          where: {
            id: imageMediaAssetId,
            ownerUserId: { in: allowedImageOwnerIds },
            status: MediaAssetStatus.READY,
            visibility: MediaVisibility.PUBLIC,
            mimeType: { startsWith: "image/", mode: "insensitive" }
          },
          select: { id: true }
        });

        if (!image) {
          return { ok: false as const, error: "The job image could not be found." };
        }
      }

      const job = await transaction.jobListing.update({
        where: { id: listingOwner.id },
        data: {
          title: parsed.data.title,
          companyName: parsed.data.companyName || null,
          summary: parsed.data.summary || null,
          description: parsed.data.description,
          needs: parsed.data.needs || null,
          wants: parsed.data.wants || null,
          category: parsed.data.category,
          employmentType: parsed.data.employmentType,
          location: parsed.data.location || null,
          remote: parsed.data.remote,
          compensation: parsed.data.compensation || null,
          contactEmail: parsed.data.contactEmail || null,
          contactPhone: parsed.data.contactPhone || null,
          contactInstructions: parsed.data.contactInstructions || null,
          imageMediaAssetId,
          imageOverlayText: parsed.data.imageOverlayText || null
        }
      });

      return { ok: true as const, job };
    })
  );

  if (!referenceValidation.ok) return referenceValidation;
  const update = referenceValidation.value;
  if (!update.ok) return update;

  await diagnostics.info(MODULE_KEY, "Job listing updated.", {
    viewerUserId,
    jobListingId: update.job.id
  });

  return { ok: true as const, job: update.job };
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
      },
      image: true
    }
  });

  if (!job) {
    return { ok: false as const, error: "Job listing not found." };
  }

  const [role, generalAdAccess] = await Promise.all([
    getViewerRole(viewerUserId),
    canUserAccessFeature(viewerUserId, "ads.createGeneral")
  ]);
  const canPromote = canViewerPromoteJob({
    viewerUserId,
    employerUserId: job.employerUserId,
    canCreateGeneralAd: generalAdAccess.allowed
  });
  const detail: JobListingDetailView = {
    ...toJobCardView(job),
    description: job.description,
    needs: job.needs,
    wants: job.wants,
    contactEmail: job.contactEmail,
    contactPhone: job.contactPhone,
    contactInstructions: job.contactInstructions,
    imageOriginalName: job.image?.originalName,
    viewerCanManage: isAdminRole(role) || job.employerUserId === viewerUserId,
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
