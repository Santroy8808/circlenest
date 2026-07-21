import assert from "node:assert/strict";
import test from "node:test";
import { MembershipTier } from "@prisma/client";
import {
  isActiveContributorCreditRecipient,
  utcMonthlyCreditPeriod
} from "@/modules/membership-policy/monthly-credits.service";

test("monthly credit periods use stable UTC boundaries", () => {
  const period = utcMonthlyCreditPeriod(new Date("2026-07-31T23:59:59.999-07:00"));
  assert.equal(period.key, "2026-08");
  assert.equal(period.start.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(period.end.toISOString(), "2026-09-01T00:00:00.000Z");
});

test("only an active Contributor account receives monthly credits", () => {
  assert.equal(
    isActiveContributorCreditRecipient({ tier: MembershipTier.CONTRIBUTOR, deactivatedAt: null }),
    true
  );
  assert.equal(
    isActiveContributorCreditRecipient({ tier: MembershipTier.FREE, deactivatedAt: null }),
    false
  );
  assert.equal(
    isActiveContributorCreditRecipient({ tier: MembershipTier.CONTRIBUTOR, deactivatedAt: new Date() }),
    false
  );
});
