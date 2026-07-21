import assert from "node:assert/strict";
import test from "node:test";
import { ConductIncidentStatus, ConductReportStatus, FeedbackTicketStatus } from "@prisma/client";
import { canTransitionFeedbackTicket } from "./feedback-tickets.service";
import {
  canTransitionConductReport,
  deriveConductIncidentStatus
} from "./conduct-transitions.service";

test("feedback tickets allow only the defined workflow transitions", () => {
  assert.equal(canTransitionFeedbackTicket(FeedbackTicketStatus.OPEN, FeedbackTicketStatus.IN_REVIEW), true);
  assert.equal(canTransitionFeedbackTicket(FeedbackTicketStatus.IN_REVIEW, FeedbackTicketStatus.RESOLVED), true);
  assert.equal(canTransitionFeedbackTicket(FeedbackTicketStatus.RESOLVED, FeedbackTicketStatus.IN_REVIEW), true);
  assert.equal(canTransitionFeedbackTicket(FeedbackTicketStatus.CLOSED, FeedbackTicketStatus.OPEN), true);
  assert.equal(canTransitionFeedbackTicket(FeedbackTicketStatus.OPEN, FeedbackTicketStatus.RESOLVED), false);
  assert.equal(canTransitionFeedbackTicket(FeedbackTicketStatus.CLOSED, FeedbackTicketStatus.RESOLVED), false);
  assert.equal(canTransitionFeedbackTicket(FeedbackTicketStatus.OPEN, FeedbackTicketStatus.OPEN), false);
});

test("conduct reports allow review, dispute, resolution, restriction, and reopening paths", () => {
  assert.equal(canTransitionConductReport(ConductReportStatus.ACTIVE, ConductReportStatus.UNDER_REVIEW), true);
  assert.equal(canTransitionConductReport(ConductReportStatus.UNDER_REVIEW, ConductReportStatus.DISPUTED), true);
  assert.equal(canTransitionConductReport(ConductReportStatus.DISPUTED, ConductReportStatus.RESTRICTED), true);
  assert.equal(canTransitionConductReport(ConductReportStatus.RESTRICTED, ConductReportStatus.UNDER_REVIEW), true);
  assert.equal(canTransitionConductReport(ConductReportStatus.ACTIVE, ConductReportStatus.RESOLVED), false);
  assert.equal(canTransitionConductReport(ConductReportStatus.DISMISSED, ConductReportStatus.RESTRICTED), false);
});

test("incident status is recomputed from every linked report with safety-first precedence", () => {
  assert.equal(deriveConductIncidentStatus([ConductReportStatus.DISMISSED]), ConductIncidentStatus.DISMISSED);
  assert.equal(
    deriveConductIncidentStatus([ConductReportStatus.RESOLVED, ConductReportStatus.DISMISSED]),
    ConductIncidentStatus.RESOLVED
  );
  assert.equal(
    deriveConductIncidentStatus([ConductReportStatus.ACTIVE, ConductReportStatus.RESOLVED]),
    ConductIncidentStatus.OPEN
  );
  assert.equal(
    deriveConductIncidentStatus([ConductReportStatus.UNDER_REVIEW, ConductReportStatus.ACTIVE]),
    ConductIncidentStatus.UNDER_REVIEW
  );
  assert.equal(
    deriveConductIncidentStatus([ConductReportStatus.DISPUTED, ConductReportStatus.UNDER_REVIEW]),
    ConductIncidentStatus.DISPUTED
  );
  assert.equal(
    deriveConductIncidentStatus([ConductReportStatus.RESTRICTED, ConductReportStatus.DISPUTED]),
    ConductIncidentStatus.RESTRICTED
  );
});
