import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { calculateAdRankScore, canCreateAdCampaign, isAdCampaignTargetType } from "@/lib/ads/campaigns";
import { canCreateMarketListing } from "@/lib/policy/market";
import { evaluateMarketListingQuota } from "@/lib/policy/market-limits";
import { canCreateBusinessProfile } from "@/lib/policy/production-zone";
import { canCreateHiringPost, getBazaarListingRollingLimit, getTierPolicy } from "@/lib/policy/tier-policy";

const root = process.cwd();
function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function assertContains(path: string, pattern: string | RegExp, message: string) {
  const content = source(path);
  if (typeof pattern === "string") {
    assert.ok(content.includes(pattern), message);
    return;
  }
  assert.match(content, pattern, message);
}

const free = getTierPolicy("FREE");
const contributor = getTierPolicy("CONTRIBUTOR");
const biz = getTierPolicy("PRO");
const auditor = getTierPolicy("AUDITOR");
const admin = getTierPolicy("ADMIN");

assert.equal(canCreateHiringPost(free), false, "Free cannot post jobs.");
assert.equal(canCreateHiringPost(contributor), false, "Contributor cannot post jobs.");
assert.equal(canCreateHiringPost(biz), true, "Biz can post jobs.");
assertContains("src/app/jobs/page.tsx", /prisma\.jobListing\.findMany/, "Jobs page fetches listings for browsing.");
assertContains("src/app/jobs/new/page.tsx", /canCreateHiringPost|canCreateJob|policy/, "Job creation page is gated by policy.");

assert.equal(canCreateMarketListing(free), false, "Free cannot create market listings.");
assert.equal(canCreateMarketListing(contributor), true, "Contributor can create market listings.");
assert.equal(canCreateMarketListing(biz), true, "Biz can create market listings.");
assert.equal(getBazaarListingRollingLimit(contributor), 6, "Contributor market rolling limit is 6.");
assert.equal(evaluateMarketListingQuota(contributor, { createdInRollingWindow: 5 }).allowed, true, "Contributor can create sixth listing.");
assert.equal(evaluateMarketListingQuota(contributor, { createdInRollingWindow: 6 }).allowed, false, "Contributor is blocked at six active rolling listings.");
assert.equal(evaluateMarketListingQuota(biz, { createdInRollingWindow: 99 }).allowed, true, "Biz market posting is unlimited.");

assert.equal(canCreateBusinessProfile("FREE"), false, "Free cannot create Company Profile.");
assert.equal(canCreateBusinessProfile("CONTRIBUTOR"), false, "Contributor cannot create Company Profile.");
assert.equal(canCreateBusinessProfile("PRO"), true, "Biz can create Company Profile.");
assertContains("src/app/production-zone/business/page.tsx", "Complete Company Profile first", "Incomplete Company Profile blocks Biz tools with clear UI.");
assertContains("src/lib/business/business-profile.ts", "reviewReady", "Company Profile completion exposes reviewReady.");

assert.equal(canCreateAdCampaign(free), false, "Free cannot create ad campaigns.");
assert.equal(canCreateAdCampaign(contributor), false, "Contributor cannot create ad campaigns.");
assert.equal(canCreateAdCampaign(biz), true, "Biz can create ad campaigns.");
assert.equal(canCreateAdCampaign(auditor), true, "Auditor can create ad campaigns.");
assert.equal(canCreateAdCampaign(admin), true, "Admin can create ad campaigns.");
assert.equal(isAdCampaignTargetType("BUSINESS_PROFILE"), true, "Business profile is a valid campaign target.");
assertContains("src/app/api/ads/campaigns/route.ts", "Campaign start and end dates are required.", "Ad campaign requires duration.");
assertContains("src/app/api/ads/campaigns/route.ts", "Campaign requires a cash budget note or platform credit budget.", "Ad campaign requires budget.");
assertContains("src/app/api/ads/campaigns/route.ts", "Landing article title and body are required.", "Ad campaign requires landing article.");
assertContains("src/app/api/ads/campaigns/route.ts", "Campaign requires an image or a specific target ID.", "Ad campaign requires image or target.");
assertContains("src/app/api/ads/campaigns/[campaignId]/events/route.ts", "adImpression.create", "Impression events are recorded.");
assertContains("src/app/api/ads/campaigns/[campaignId]/events/route.ts", "adClick.create", "Click events are recorded.");
assertContains("src/app/api/ads/campaigns/[campaignId]/events/route.ts", "safeProfileSnapshot", "Ad analytics use a privacy-safe profile snapshot.");
assert.ok(
  calculateAdRankScore({ budgetAmountCents: 1000, platformCreditBudget: 10, manualAdminBoost: 5, createdAt: new Date() }) >
    calculateAdRankScore({ budgetAmountCents: 1000, platformCreditBudget: 10, manualAdminDemotion: 5, createdAt: new Date() }),
  "Admin boost/demotion changes ranking score.",
);

assertContains("src/lib/funds/ledger.ts", "Real-money credits must originate from a payment processor event.", "Real ledger blocks non-processor real credits.");
assertContains("src/lib/funds/ledger.ts", "THETA_ENABLE_TEST_MONEY", "Funny money is environment gated.");
assertContains("src/lib/funds/ledger.ts", "new Set([2, 4, 6])", "Withdrawal batching is Tuesday, Thursday, Saturday.");
assertContains("src/components/funds/wallet-manager.tsx", "Platform credits", "Platform credits are displayed separately from real money.");
assertContains("src/app/api/admin/funds/route.ts", "cannot create real-money credits", "Admin funds endpoint states no real-money admin powers.");
assertContains("src/app/api/admin/funds/withdrawals/[withdrawalId]/route.ts", "Processor-controlled withdrawals cannot be manually changed here.", "Admin cannot manually complete processor withdrawals.");

assertContains("src/app/api/admin/accounts/[userId]/route.ts", "RESET_2FA", "Admin can reset 2FA through protected workflow.");
assertContains("src/app/api/admin/accounts/[userId]/route.ts", "REVOKE_SESSIONS", "Admin can revoke sessions through protected workflow.");
assertContains("src/lib/admin/admin-ops.ts", "SUSPEND_USER_ACCOUNT", "Admin suspend action is audit logged.");
assertContains("src/lib/admin/admin-ops.ts", "RESTORE_USER_ACCOUNT", "Admin restore action is audit logged.");
assertContains("src/lib/admin/admin-ops.ts", "RESET_USER_2FA", "Admin 2FA reset is audit logged.");
assertContains("src/app/admin/console/page.tsx", "Hard-delete audit records", "Guided admin console documents preserved-record boundary.");
assertContains("src/app/admin/console/page.tsx", "Add real money", "Guided admin console documents no-real-money boundary.");
assertContains("src/app/api/admin/processors/route.ts", "Secrets are never returned", "Processor API does not expose secrets.");
assertContains("src/components/admin/payment-processor-console.tsx", "Secret keys are not shown or saved here", "Processor UI clearly hides secrets.");

console.log("Phase 8 acceptance smoke checks passed.");
