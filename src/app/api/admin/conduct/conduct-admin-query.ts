import { ConductReportStatus } from "@prisma/client";
import type { ConductAdminViewQuery } from "@/modules/conduct-reporting/admin.service";

export type ConductAdminQueryResult =
  | { ok: true; query: ConductAdminViewQuery }
  | { ok: false; error: string; field: string };

export function readConductAdminQuery(searchParams: URLSearchParams): ConductAdminQueryResult {
  const rawLimit = searchParams.get("limit")?.trim();
  const limit = rawLimit ? Number(rawLimit) : 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return { ok: false, error: "Limit must be a whole number from 1 to 100.", field: "limit" };
  }

  const rawStatus = searchParams.get("status")?.trim().toUpperCase();
  const status = rawStatus && rawStatus !== "ALL"
    ? Object.values(ConductReportStatus).find((candidate) => candidate === rawStatus)
    : undefined;
  if (rawStatus && rawStatus !== "ALL" && !status) {
    return { ok: false, error: "Choose a valid conduct report status.", field: "status" };
  }

  const rawAssignee = searchParams.get("assignee")?.trim();
  if (rawAssignee && rawAssignee.length > 200) {
    return { ok: false, error: "Assignee filter is too long.", field: "assignee" };
  }
  const assigneeUserId = !rawAssignee || rawAssignee === "all"
    ? undefined
    : rawAssignee === "unassigned"
      ? null
      : rawAssignee;

  const rawQuery = searchParams.get("query")?.trim();
  if (rawQuery && rawQuery.length > 120) {
    return { ok: false, error: "Search is limited to 120 characters.", field: "query" };
  }

  return {
    ok: true,
    query: {
      take: limit,
      ...(status ? { status } : {}),
      ...(assigneeUserId !== undefined ? { assigneeUserId } : {}),
      ...(rawQuery ? { query: rawQuery } : {})
    }
  };
}
