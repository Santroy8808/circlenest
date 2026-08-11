import assert from "node:assert/strict";
import test from "node:test";
import { JobCategory, JobEmploymentType, JobListingStatus } from "@prisma/client";
import { buildJobListingWhere, canViewerPromoteJob, toPublicJobCardView } from "@/modules/jobs/jobs.service";
import { isJobSearchCategory, jobCategoryOptions } from "@/modules/jobs/types";

test("job promotion requires both listing ownership and an advertising capability", () => {
  const base = {
    viewerUserId: "viewer",
    employerUserId: "viewer",
    canCreateGeneralAd: false
  };

  assert.equal(canViewerPromoteJob(base), false);
  assert.equal(canViewerPromoteJob({ ...base, canCreateGeneralAd: true }), true);
  assert.equal(
    canViewerPromoteJob({
      ...base,
      employerUserId: "someone-else",
      canCreateGeneralAd: true
    }),
    false
  );
});

test("job category options hide auditing and training search criteria", () => {
  assert.equal(isJobSearchCategory(JobCategory.AUDITING), false);
  assert.equal(isJobSearchCategory(JobCategory.TRAINING), false);
  assert.equal(jobCategoryOptions.some((option) => option.value === JobCategory.AUDITING), false);
  assert.equal(jobCategoryOptions.some((option) => option.value === JobCategory.TRAINING), false);
  assert.equal(jobCategoryOptions.some((option) => option.value === JobCategory.ADMINISTRATION), true);
});

test("job listing search supports location as a dedicated criterion", () => {
  assert.deepEqual(buildJobListingWhere({ location: "Austin, TX", category: JobCategory.SALES }), {
    status: JobListingStatus.ACTIVE,
    category: JobCategory.SALES,
    AND: [
      {
        OR: [
          {
            location: {
              contains: "Austin, TX",
              mode: "insensitive"
            }
          }
        ]
      }
    ]
  });
});

test("job listing search ignores hidden category filters and matches remote locations", () => {
  assert.deepEqual(buildJobListingWhere({ location: "remote", category: JobCategory.TRAINING }), {
    status: JobListingStatus.ACTIVE,
    AND: [
      {
        OR: [
          {
            location: {
              contains: "remote",
              mode: "insensitive"
            }
          },
          {
            remote: true
          }
        ]
      }
    ]
  });
});

test("public job cards exclude member account details and private storefronts", () => {
  const job = {
    id: "job-1",
    slug: "bookkeeper-austin",
    title: "Bookkeeper - Austin, TX",
    companyName: "Theta Books",
    summary: "Keep accounts accurate.",
    category: JobCategory.ADMINISTRATION,
    employmentType: JobEmploymentType.FULL_TIME,
    location: "Austin, Texas, United States",
    remote: false,
    compensation: "$60,000 - $75,000",
    imageMediaAssetId: "asset-1",
    imageOverlayText: "Experienced bookkeeper",
    status: JobListingStatus.ACTIVE,
    createdAt: new Date("2026-08-11T00:00:00.000Z"),
    employer: {
      id: "user-1",
      username: "private-handle",
      profile: { displayName: "Private Owner" },
      businessProfile: {
        businessName: "Theta Books",
        location: "Austin, Texas, United States",
        logoUrl: "https://example.com/logo.png",
        publicStorefrontEnabled: false,
        slug: "theta-books"
      }
    },
    image: {
      publicUrl: "https://example.com/job.png",
      storageKey: "jobs/job.png"
    }
  } as unknown as Parameters<typeof toPublicJobCardView>[0];

  const publicJob = toPublicJobCardView(job);

  assert.deepEqual(publicJob.employer, { displayName: "Private Owner" });
  assert.equal(publicJob.business, null);
  assert.equal("id" in publicJob, false);
  assert.equal("status" in publicJob, false);
  assert.equal("imageMediaAssetId" in publicJob, false);
});
