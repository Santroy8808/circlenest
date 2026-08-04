import assert from "node:assert/strict";
import test from "node:test";
import { JobCategory, JobListingStatus } from "@prisma/client";
import { buildJobListingWhere, canViewerPromoteJob } from "@/modules/jobs/jobs.service";
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
