import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRollingMarketQuotaWhere,
  canViewerPromoteListing,
  planMarketPhotoAdditions,
  validateRentalListing
} from "@/modules/market/market.service";
import { MarketListingCategory } from "@prisma/client";

test("rolling Market quota counts every creation, including archived listings", () => {
  const cutoff = new Date("2026-07-07T00:00:00.000Z");
  assert.deepEqual(buildRollingMarketQuotaWhere("member-1", cutoff), {
    sellerUserId: "member-1",
    createdAt: { gte: cutoff }
  });
});

test("photo additions are deduplicated and evaluated against the final atomic count", () => {
  assert.deepEqual(
    planMarketPhotoAdditions({
      existingPhotoIds: ["photo-1", "photo-2"],
      requestedPhotoIds: ["photo-2", "photo-3", "photo-3"],
      photoCap: 3
    }),
    {
      newPhotoIds: ["photo-3"],
      finalPhotoCount: 3,
      capExceeded: false
    }
  );

  assert.equal(
    planMarketPhotoAdditions({
      existingPhotoIds: ["photo-1", "photo-2", "photo-3"],
      requestedPhotoIds: ["photo-4"],
      photoCap: 3
    }).capExceeded,
    true
  );
});

test("listing promotion requires both ownership and promotion entitlement", () => {
  assert.equal(canViewerPromoteListing({ isOwner: true, hasPromotionEntitlement: true }), true);
  assert.equal(canViewerPromoteListing({ isOwner: true, hasPromotionEntitlement: false }), false);
  assert.equal(canViewerPromoteListing({ isOwner: false, hasPromotionEntitlement: true }), false);
});

test("rental listings require the core housing details", () => {
  assert.match(validateRentalListing({ category: MarketListingCategory.RENTALS }) ?? "", /property type/i);
  assert.equal(validateRentalListing({
    category: MarketListingCategory.RENTALS,
    location: "Moab, Utah",
    priceCents: 185000,
    rentalPropertyType: "Apartment",
    rentalBedrooms: 2,
    rentalBathrooms: 1,
    rentalAvailableAt: "2026-09-01T00:00:00.000Z"
  }), null);
  assert.equal(validateRentalListing({ category: MarketListingCategory.SERVICES }), null);
});
