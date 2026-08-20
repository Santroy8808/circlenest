import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";

import {
  canManageMarketplaceListing,
  decodeMarketplaceCursor,
  encodeMarketplaceCursor,
  isMarketplaceDirectoryBridgeRecord,
  publicMarketplaceReviewSummary,
  redactMarketplaceContact,
  validateMarketplacePublicationPolicy,
} from "./marketplace-policy";
import { marketplaceListingInputSchema } from "./marketplace.contracts";

function listing(overrides: Record<string, unknown> = {}) {
  return marketplaceListingInputSchema.parse({
    kind: "JOB",
    intent: "OFFER",
    title: "Experienced office manager",
    description: "Manage schedules, customer inquiries, records, and day-to-day office operations.",
    category: "Administration",
    attributes: { companyName: "Example Company", responsibilities: "Manage the office." },
    priceType: "RANGE",
    priceMinCents: 50_000,
    priceMaxCents: 65_000,
    publisher: { kind: "PERSONAL" },
    location: { countryCode: "US", region: "Texas", city: "Austin" },
    contact: { allowInAppMessages: true },
    ...overrides,
  });
}

test("jobs and rentals reject religious preference language", () => {
  assert.match(validateMarketplacePublicationPolicy(listing({ description: "Scientologists only may apply for this office position." })) ?? "", /cannot require/i);
  assert.equal(validateMarketplacePublicationPolicy(listing()), null);
});

test("regulated goods require a legal compliance attestation", () => {
  const goods = listing({
    kind: "GOODS",
    title: "Regulated sporting item",
    description: "Local transfer only and all laws must be followed for this sporting item.",
    category: "Other",
    attributes: { regulatedCategory: "firearm", legalComplianceAttested: false },
  });
  assert.match(validateMarketplacePublicationPolicy(goods) ?? "", /Confirm/);
});

test("auditor offers require an accurate-qualification attestation", () => {
  const auditor = listing({
    kind: "AUDITOR",
    title: "Independent auditing appointments",
    description: "Appointments are available during weekdays and on Saturday by arrangement.",
    category: "Field Auditors",
    priceType: "CONTACT",
    priceMinCents: null,
    priceMaxCents: null,
    attributes: {
      directoryKind: "field-auditor",
      services: ["Dianetics"],
      qualifications: "Current qualifications listed on request.",
      qualificationsAttested: false,
    },
  });
  assert.match(validateMarketplacePublicationPolicy(auditor) ?? "", /qualifications/i);
  assert.equal(validateMarketplacePublicationPolicy({ ...auditor, attributes: { ...auditor.attributes, qualificationsAttested: true } }), null);
});

test("public contact redaction is explicit per field", () => {
  const source = {
    contactEmail: "seller@example.com",
    contactPhone: "555-0100",
    contactWebsite: "https://example.com",
    exactAddress: "10 Main Street",
    showEmail: false,
    showPhone: true,
    showWebsite: false,
    showExactAddress: false,
  };
  assert.deepEqual(redactMarketplaceContact(source, false), {
    email: null,
    phone: "555-0100",
    website: null,
    exactAddress: null,
  });
  assert.equal(redactMarketplaceContact(source, true).email, "seller@example.com");
});

test("review summaries remain private until three verified reviews", () => {
  assert.deepEqual(publicMarketplaceReviewSummary([{ rating: 5 }, { rating: 4 }]), { average: null, count: 2, public: false });
  assert.deepEqual(publicMarketplaceReviewSummary([{ rating: 5 }, { rating: 4 }, { rating: 4 }]), { average: 4.3, count: 3, public: true });
});

test("listing manager and cursor policies are stable", () => {
  assert.equal(canManageMarketplaceListing({ viewerUserId: "a", ownerUserId: "a", viewerRole: UserRole.MEMBER }), true);
  assert.equal(canManageMarketplaceListing({ viewerUserId: "a", ownerUserId: "b", viewerRole: UserRole.ADMIN }), true);
  assert.equal(canManageMarketplaceListing({ viewerUserId: "a", ownerUserId: "b", viewerRole: UserRole.MEMBER }), false);
  assert.equal(decodeMarketplaceCursor(encodeMarketplaceCursor(48)), 48);
  assert.equal(decodeMarketplaceCursor("invalid"), 0);
});

test("directory imports are not marketplace records", () => {
  assert.equal(isMarketplaceDirectoryBridgeRecord({ sourceProfileSync: true, directoryOnly: true }), true);
  assert.equal(isMarketplaceDirectoryBridgeRecord({ sourceProfileSync: false }), false);
  assert.equal(isMarketplaceDirectoryBridgeRecord({ qualificationsAttested: true }), false);
  assert.equal(isMarketplaceDirectoryBridgeRecord(null), false);
});
