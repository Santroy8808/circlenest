import assert from "node:assert/strict";
import test from "node:test";
import { AccountPurpose } from "@prisma/client";
import { buildDefaultHomeOptions } from "@/modules/home-preferences/default-home-preferences.service";

const platformFeatures = {
  "community.groups": true,
  "communication.direct_messages": true,
  "directory.auditor_directory": true,
  "marketplace.member_market": true,
  "media.personal_gallery": true,
  "publishing.writers_corner": true
};

test("default home options include stream, market, and jobs when available", () => {
  const options = buildDefaultHomeOptions({
    features: {
      "auditors.browse": true,
      "jobs.browse": true,
      "writers.access": false
    },
    mailEnabled: false,
    platformFeatures
  });

  assert.deepEqual(
    options.slice(0, 3).map((option) => option.key),
    ["stream", "market", "jobs"]
  );
  assert.equal(options.some((option) => option.key === "writers"), false);
});

test("default home options expose higher-tier destinations only when allowed", () => {
  const options = buildDefaultHomeOptions({
    features: {
      "ads.createGeneral": true,
      "auditors.browse": true,
      "jobs.browse": true,
      "market.storefront": true,
      "writers.access": true
    },
    mailEnabled: true,
    platformFeatures
  }).map((option) => option.key);

  assert.equal(options.includes("writers"), true);
  assert.equal(options.includes("business"), true);
  assert.equal(options.includes("ads"), true);
  assert.equal(options.includes("mail"), true);
});

test("auditor seeker accounts default to the auditor directory options", () => {
  const options = buildDefaultHomeOptions({
    accountPurpose: AccountPurpose.AUDITOR_SEEKER,
    features: {},
    mailEnabled: false,
    platformFeatures
  });

  assert.deepEqual(options.map((option) => option.key), ["auditors", "stream"]);
});
