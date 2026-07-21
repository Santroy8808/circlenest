export const CONDUCT_REPORT_STATUSES = [
  "ACTIVE",
  "UNDER_REVIEW",
  "DISPUTED",
  "RESOLVED",
  "DISMISSED",
  "RESTRICTED"
] as const;

export type ConductReportStatusView = (typeof CONDUCT_REPORT_STATUSES)[number];

export type ConductMemberView = {
  id: string;
  username: string | null;
  label: string;
};

export type ConductAssigneeView = ConductMemberView & {
  username: string;
  role: "ADMIN" | "GOD";
};

export type ConductReportView = {
  id: string;
  reference: string;
  type: string;
  status: ConductReportStatusView;
  version: number;
  reasonCode: string;
  context: string | null;
  policyCodes: string[];
  reportedMember: ConductMemberView;
  reporterMember: ConductMemberView | null;
  resolvedByMember: ConductMemberView | null;
  resolutionReason: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  dispute: { reference: string; status: string } | null;
  incident: {
    id: string;
    reference: string;
    status: string;
    version: number;
    source: string;
    locationType: string;
    subjectContentId: string;
    subjectMember: ConductMemberView;
    permalink: string;
    contextSummary: string | null;
    policyCodes: string[];
    assignedModeratorUserId: string | null;
    assignedModerator: ConductMemberView | null;
    createdAt: string;
    updatedAt: string;
  };
};

export type ConductAdminView = {
  generatedAt: string;
  reports: ConductReportView[];
  assignees: ConductAssigneeView[];
};

export type ConductReportFilters = {
  query: string;
  status: "all" | ConductReportStatusView;
  assignee: "all" | "unassigned" | string;
};

export type ConductReportSnapshot = {
  id: string;
  reference: string;
  incidentId: string;
  status: ConductReportStatusView;
  incidentStatus: string;
  incidentVersion: number;
  assignedModeratorUserId: string | null;
  resolvedByUserId: string | null;
  resolutionReason: string | null;
  resolvedAt: string | null;
  version: number;
  updatedAt: string;
};

export type ConductCommandIntent =
  | {
      action: "conduct-report.transition";
      target: { type: "ConductReport"; id: string };
      reason: string;
      expectedVersion: number;
      payload: {
        fromStatus: ConductReportStatusView;
        toStatus: ConductReportStatusView;
        note: string;
      };
    }
  | {
      action: "conduct-report.assign";
      target: { type: "ConductReport"; id: string };
      reason: string;
      expectedVersion: number;
      payload: {
        assigneeUserId: string | null;
        expectedIncidentVersion: number;
        note: string;
      };
    };

export type ConductMutationResponse = {
  ok: true;
  receipt: {
    commandId: string;
    auditLogId: string;
    status: "completed";
    replayed: boolean;
    result: ConductReportSnapshot;
  };
};

const LEGAL_TRANSITIONS: Readonly<Record<ConductReportStatusView, readonly ConductReportStatusView[]>> = {
  ACTIVE: ["UNDER_REVIEW", "DISMISSED"],
  UNDER_REVIEW: ["ACTIVE", "RESOLVED", "DISMISSED"],
  DISPUTED: [],
  RESOLVED: ["UNDER_REVIEW"],
  DISMISSED: ["UNDER_REVIEW"],
  RESTRICTED: []
};

function normalizeText(value: string) {
  return value.trim().replace(/\r\n/g, "\n");
}

function validCommandText(value: string, minimum: number, maximum: number, label: string) {
  const normalized = normalizeText(value);
  if (normalized.length < minimum) return { ok: false as const, error: `${label} must be at least ${minimum} characters.` };
  if (normalized.length > maximum) return { ok: false as const, error: `${label} must be ${maximum} characters or fewer.` };
  return { ok: true as const, value: normalized };
}

export function legalConductTransitions(status: ConductReportStatusView) {
  return LEGAL_TRANSITIONS[status];
}

export function legalConductTransitionsForReport(report: ConductReportView) {
  if (
    report.dispute &&
    (report.status === "RESOLVED" || report.status === "DISMISSED")
  ) return [] as readonly ConductReportStatusView[];
  return legalConductTransitions(report.status);
}

export function buildConductTransitionIntent(
  report: ConductReportView,
  input: { toStatus: string; reason: string; note: string }
): { ok: true; command: ConductCommandIntent } | { ok: false; error: string } {
  if (!isConductReportStatus(input.toStatus) || !legalConductTransitionsForReport(report).includes(input.toStatus)) {
    return { ok: false, error: `A report cannot move from ${humanizeConductValue(report.status)} to that status.` };
  }
  const reason = validCommandText(input.reason, 10, 1000, "Administrative reason");
  if (!reason.ok) return reason;
  const note = validCommandText(input.note, 2, 4000, "Review note");
  if (!note.ok) return note;
  return {
    ok: true,
    command: {
      action: "conduct-report.transition",
      target: { type: "ConductReport", id: report.id },
      reason: reason.value,
      expectedVersion: report.version,
      payload: {
        fromStatus: report.status,
        toStatus: input.toStatus,
        note: note.value
      }
    }
  };
}

export function buildConductAssignmentIntent(
  report: ConductReportView,
  input: { assigneeUserId: string | null; reason: string; note: string },
  assignees: readonly ConductAssigneeView[]
): { ok: true; command: ConductCommandIntent } | { ok: false; error: string } {
  if (input.assigneeUserId !== null && !assignees.some((assignee) => assignee.id === input.assigneeUserId)) {
    return { ok: false, error: "Choose an active administrator from the current list." };
  }
  if (input.assigneeUserId === report.incident.assignedModeratorUserId) {
    return { ok: false, error: "Choose a different reviewer, or leave the current assignment unchanged." };
  }
  const reason = validCommandText(input.reason, 10, 1000, "Administrative reason");
  if (!reason.ok) return reason;
  const note = validCommandText(input.note, 2, 4000, "Assignment note");
  if (!note.ok) return note;
  return {
    ok: true,
    command: {
      action: "conduct-report.assign",
      target: { type: "ConductReport", id: report.id },
      reason: reason.value,
      expectedVersion: report.version,
      payload: {
        assigneeUserId: input.assigneeUserId,
        expectedIncidentVersion: report.incident.version,
        note: note.value
      }
    }
  };
}

export function serializeConductCommandIntent(command: ConductCommandIntent) {
  return JSON.stringify(command);
}

export function conductCommandIdentity(
  previous: { intent: string; commandId: string } | null,
  command: ConductCommandIntent,
  createCommandId: () => string
) {
  const intent = serializeConductCommandIntent(command);
  return previous?.intent === intent ? previous : { intent, commandId: createCommandId() };
}

export function humanizeConductValue(value: string) {
  return value.toLowerCase().replace(/_/g, " ").replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

export function filterConductReports(
  reports: readonly ConductReportView[],
  filters: ConductReportFilters
) {
  const needle = filters.query.trim().toLowerCase();
  return reports.filter((report) => {
    if (filters.status !== "all" && report.status !== filters.status) return false;
    if (filters.assignee === "unassigned" && report.incident.assignedModeratorUserId !== null) return false;
    if (filters.assignee !== "all" && filters.assignee !== "unassigned" && report.incident.assignedModeratorUserId !== filters.assignee) return false;
    if (!needle) return true;
    return [
      report.reference,
      report.type,
      report.status,
      report.reasonCode,
      report.context,
      report.policyCodes.join(" "),
      report.reportedMember.label,
      report.reporterMember?.label,
      report.incident.reference,
      report.incident.source,
      report.incident.locationType,
      report.incident.subjectMember.label,
      report.incident.policyCodes.join(" "),
      report.incident.assignedModerator?.label,
      report.dispute?.reference
    ].some((value) => value?.toLowerCase().includes(needle));
  });
}

export function conductAdminViewUrl(filters: ConductReportFilters) {
  const searchParams = new URLSearchParams({ limit: "100" });
  const query = filters.query.trim();
  if (query) searchParams.set("query", query);
  if (filters.status !== "all") searchParams.set("status", filters.status);
  if (filters.assignee !== "all") searchParams.set("assignee", filters.assignee);
  return `/api/admin/conduct?${searchParams.toString()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isIsoDate(value: unknown): value is string {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function isNullableIsoDate(value: unknown): value is string | null {
  return value === null || isIsoDate(value);
}

export function isConductReportStatus(value: unknown): value is ConductReportStatusView {
  return typeof value === "string" && CONDUCT_REPORT_STATUSES.some((status) => status === value);
}

function isMemberView(value: unknown): value is ConductMemberView {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.id) && isNullableString(value.username) && isNonEmptyString(value.label);
}

function isAssigneeView(value: unknown): value is ConductAssigneeView {
  if (!isMemberView(value)) return false;
  const assignee = value as ConductMemberView & Record<string, unknown>;
  return assignee.username !== null && (assignee.role === "ADMIN" || assignee.role === "GOD");
}

function isConductReportView(value: unknown): value is ConductReportView {
  if (!isRecord(value) || !isRecord(value.incident)) return false;
  const incident = value.incident;
  const disputeValid = value.dispute === null || (
    isRecord(value.dispute) && isNonEmptyString(value.dispute.reference) && isNonEmptyString(value.dispute.status)
  );
  return Boolean(
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.reference) &&
    isNonEmptyString(value.type) &&
    isConductReportStatus(value.status) &&
    Number.isInteger(value.version) &&
    (value.version as number) >= 1 &&
    isNonEmptyString(value.reasonCode) &&
    isNullableString(value.context) &&
    Array.isArray(value.policyCodes) && value.policyCodes.every(isNonEmptyString) &&
    isMemberView(value.reportedMember) &&
    (value.reporterMember === null || isMemberView(value.reporterMember)) &&
    (value.resolvedByMember === null || isMemberView(value.resolvedByMember)) &&
    isNullableString(value.resolutionReason) &&
    isNullableIsoDate(value.resolvedAt) &&
    isIsoDate(value.createdAt) &&
    isIsoDate(value.updatedAt) &&
    disputeValid &&
    isNonEmptyString(incident.id) &&
    isNonEmptyString(incident.reference) &&
    isNonEmptyString(incident.status) &&
    Number.isInteger(incident.version) && (incident.version as number) >= 1 &&
    isNonEmptyString(incident.source) &&
    isNonEmptyString(incident.locationType) &&
    isNonEmptyString(incident.subjectContentId) &&
    isMemberView(incident.subjectMember) &&
    isNonEmptyString(incident.permalink) &&
    isNullableString(incident.contextSummary) &&
    Array.isArray(incident.policyCodes) && incident.policyCodes.every(isNonEmptyString) &&
    isNullableString(incident.assignedModeratorUserId) &&
    (incident.assignedModerator === null || isMemberView(incident.assignedModerator)) &&
    isIsoDate(incident.createdAt) &&
    isIsoDate(incident.updatedAt)
  );
}

export function isConductAdminView(value: unknown): value is ConductAdminView {
  if (!isRecord(value)) return false;
  return Boolean(
    isIsoDate(value.generatedAt) &&
    Array.isArray(value.reports) &&
    value.reports.length <= 100 &&
    value.reports.every(isConductReportView) &&
    Array.isArray(value.assignees) &&
    value.assignees.length <= 1000 &&
    value.assignees.every(isAssigneeView)
  );
}

function isConductReportSnapshot(value: unknown): value is ConductReportSnapshot {
  if (!isRecord(value)) return false;
  return Boolean(
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.reference) &&
    isNonEmptyString(value.incidentId) &&
    isConductReportStatus(value.status) &&
    isNonEmptyString(value.incidentStatus) &&
    Number.isInteger(value.incidentVersion) &&
    (value.incidentVersion as number) >= 1 &&
    isNullableString(value.assignedModeratorUserId) &&
    isNullableString(value.resolvedByUserId) &&
    isNullableString(value.resolutionReason) &&
    isNullableIsoDate(value.resolvedAt) &&
    Number.isInteger(value.version) &&
    (value.version as number) >= 1 &&
    isIsoDate(value.updatedAt)
  );
}

export function isConductMutationResponse(value: unknown): value is ConductMutationResponse {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.receipt)) return false;
  const receipt = value.receipt;
  return Boolean(
    isNonEmptyString(receipt.commandId) &&
    isNonEmptyString(receipt.auditLogId) &&
    receipt.status === "completed" &&
    typeof receipt.replayed === "boolean" &&
    isConductReportSnapshot(receipt.result)
  );
}

export function isConductMutationForCommand(
  value: unknown,
  commandId: string,
  command: ConductCommandIntent
): value is ConductMutationResponse {
  if (!isConductMutationResponse(value)) return false;
  if (
    value.receipt.commandId !== commandId ||
    value.receipt.result.id !== command.target.id ||
    value.receipt.result.version !== command.expectedVersion + 1
  ) return false;
  return command.action === "conduct-report.transition"
    ? value.receipt.result.status === command.payload.toStatus
    : value.receipt.result.assignedModeratorUserId === command.payload.assigneeUserId;
}

export function conductErrorResponse(value: unknown) {
  if (!isRecord(value)) return {};
  return {
    error: typeof value.error === "string" ? value.error : undefined,
    code: typeof value.code === "string" ? value.code : undefined,
    field: typeof value.field === "string" ? value.field : undefined,
    retryable: typeof value.retryable === "boolean" ? value.retryable : undefined
  };
}
