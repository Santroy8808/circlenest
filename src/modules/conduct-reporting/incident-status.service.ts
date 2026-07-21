import { ConductIncidentStatus, ConductReportStatus, type Prisma } from "@prisma/client";

export function deriveConductIncidentStatus(statuses: readonly ConductReportStatus[]): ConductIncidentStatus {
  if (statuses.includes(ConductReportStatus.RESTRICTED)) return ConductIncidentStatus.RESTRICTED;
  if (statuses.includes(ConductReportStatus.DISPUTED)) return ConductIncidentStatus.DISPUTED;
  if (statuses.includes(ConductReportStatus.UNDER_REVIEW)) return ConductIncidentStatus.UNDER_REVIEW;
  if (statuses.includes(ConductReportStatus.ACTIVE)) return ConductIncidentStatus.OPEN;
  if (statuses.includes(ConductReportStatus.RESOLVED)) return ConductIncidentStatus.RESOLVED;
  return ConductIncidentStatus.DISMISSED;
}

/**
 * Recomputes the aggregate after callers have locked the incident and completed
 * every report mutation in the same transaction. One call is one incident
 * version change, regardless of how many linked reports exist.
 */
export async function recomputeLockedConductIncidentStatus(
  transaction: Prisma.TransactionClient,
  incidentId: string
) {
  const reports = await transaction.conductReport.findMany({
    where: { incidentId },
    select: { status: true }
  });
  if (reports.length === 0) {
    throw new Error("A conduct incident cannot be aggregated without a linked report.");
  }
  const status = deriveConductIncidentStatus(reports.map((report) => report.status));
  return transaction.conductIncident.update({
    where: { id: incidentId },
    data: { status, version: { increment: 1 } }
  });
}
