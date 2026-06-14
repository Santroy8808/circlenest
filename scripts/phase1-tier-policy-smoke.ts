import { strict as assert } from "node:assert";
import { canCreateHiringPost, getBazaarListingRollingLimit, getTierPolicy } from "@/lib/policy/tier-policy";
import { canCreateMarketListing } from "@/lib/policy/market";
import { evaluateMarketListingQuota } from "@/lib/policy/market-limits";

const free = getTierPolicy("FREE");
const contributor = getTierPolicy("CONTRIBUTOR");
const biz = getTierPolicy("PRO");
const admin = getTierPolicy("ADMIN");

assert.equal(canCreateHiringPost(free), false, "Free cannot create job listings.");
assert.equal(canCreateHiringPost(contributor), false, "Contributor cannot create job listings.");
assert.equal(canCreateHiringPost(biz), true, "Biz can create job listings.");
assert.equal(canCreateHiringPost(admin), true, "Admin can create job listings.");

assert.equal(canCreateMarketListing(free), false, "Free cannot create Market listings.");
assert.equal(canCreateMarketListing(contributor), true, "Contributor can create Market listings.");
assert.equal(canCreateMarketListing(biz), true, "Biz can create Market listings.");

assert.equal(getBazaarListingRollingLimit(contributor), 6, "Contributor Market cap is 6 listings per 2 weeks.");
assert.equal(evaluateMarketListingQuota(contributor, { createdInRollingWindow: 5 }).allowed, true, "Contributor can create the 6th listing in a 2-week window.");
assert.equal(evaluateMarketListingQuota(contributor, { createdInRollingWindow: 6 }).allowed, false, "Contributor is blocked after 6 listings in a 2-week window.");
assert.equal(evaluateMarketListingQuota(biz, { createdInRollingWindow: 100 }).allowed, true, "Biz Market listings are unlimited.");

console.log("Phase 1 tier policy smoke checks passed.");
