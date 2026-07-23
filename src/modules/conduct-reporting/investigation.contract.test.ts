import assert from "node:assert/strict";
import test from "node:test";
import { accountSearchRank } from "@/modules/admin-moderation/status-change.service";
import { evaluateFlagTransition } from "@/modules/conduct-reporting/investigation.service";
import { validateInvestigationAnalysis } from "@/modules/conduct-reporting/provider";

test("partial account matches rank an embedded username before a weaker email match", () => {
  const query = "621";
  const usernameMatch = accountSearchRank({ username: "free-qa-621725", email: "qa@example.com", displayName: "Free QA 621725" }, query);
  const emailOnlyMatch = accountSearchRank({ username: "other-user", email: "account621@example.com", displayName: "Other User" }, query);
  assert.ok(usernameMatch < emailOnlyMatch);
});

test("a new distinct flag extends active flags and the third queues an investigation", () => {
  const now = new Date("2026-07-22T12:00:00.000Z");
  const transition = evaluateFlagTransition({ alreadyActive: false, activeBefore: 2, activeAfter: 3, now });
  assert.equal(transition.extendExistingFlags, true);
  assert.equal(transition.queueInvestigation, true);
  assert.equal(transition.expiresAt.toISOString(), "2026-08-05T12:00:00.000Z");
});

test("reflagging the same active post neither extends the window nor retriggers investigation", () => {
  const transition = evaluateFlagTransition({ alreadyActive: true, activeBefore: 3, activeAfter: 3, now: new Date("2026-07-22T12:00:00.000Z") });
  assert.equal(transition.extendExistingFlags, false);
  assert.equal(transition.queueInvestigation, false);
});

test("AI report validation removes citations that were not supplied as sources", () => {
  const analysis = validateInvestigationAnalysis({
    overallAssessment: "Repeated behavior requires human review.",
    riskLevel: "MEDIUM",
    patterns: [{
      label: "Repeated targeting",
      explanation: "Two supplied posts contain the same pattern.",
      confidence: 0.8,
      evidencePostIds: ["post-1", "invented-post", "post-2"]
    }],
    policyCodes: ["HARASSMENT"],
    recommendedAction: "HUMAN_REVIEW",
    limitations: ["Private messages were not reviewed."]
  }, new Set(["post-1", "post-2"]));
  assert.deepEqual(analysis?.patterns[0]?.evidencePostIds, ["post-1", "post-2"]);
});

test("AI report validation rejects malformed recommendations", () => {
  const analysis = validateInvestigationAnalysis({
    overallAssessment: "Invalid action",
    riskLevel: "MEDIUM",
    patterns: [],
    policyCodes: [],
    recommendedAction: "DELETE_USER",
    limitations: []
  }, new Set());
  assert.equal(analysis, null);
});
