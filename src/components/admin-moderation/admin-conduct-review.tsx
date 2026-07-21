"use client";

import { useEffect, useRef, useState } from "react";
import {
  CONDUCT_REPORT_STATUSES,
  buildConductAssignmentIntent,
  buildConductTransitionIntent,
  conductAdminViewUrl,
  conductCommandIdentity,
  conductErrorResponse,
  humanizeConductValue,
  isConductAdminView,
  isConductMutationForCommand,
  legalConductTransitionsForReport,
  type ConductAdminView,
  type ConductCommandIntent,
  type ConductReportStatusView,
  type ConductReportView
} from "@/components/admin-moderation/conduct-review-ui-contract";

function stableDate(value: string) {
  return `${value.replace("T", " ").slice(0, 16)} UTC`;
}

function statusClass(status: ConductReportStatusView) {
  if (status === "DISMISSED" || status === "RESOLVED") return "border-[var(--green)] text-[var(--green)]";
  if (status === "RESTRICTED" || status === "DISPUTED") return "border-[var(--red)] text-[var(--red)]";
  return "border-[var(--gold)] text-[var(--gold)]";
}

function ReportCard({
  assignees,
  busy,
  pendingAction,
  onCommand,
  report
}: {
  assignees: ConductAdminView["assignees"];
  busy: boolean;
  pendingAction: "transition" | "assignment" | null;
  onCommand: (command: ConductCommandIntent) => void;
  report: ConductReportView;
}) {
  const transitions = legalConductTransitionsForReport(report);
  const currentAssigneeUnavailable = Boolean(
    report.incident.assignedModeratorUserId &&
    !assignees.some((assignee) => assignee.id === report.incident.assignedModeratorUserId)
  );
  const [toStatus, setToStatus] = useState<string>(transitions[0] ?? "");
  const [transitionReason, setTransitionReason] = useState("");
  const [transitionNote, setTransitionNote] = useState("");
  const [assigneeUserId, setAssigneeUserId] = useState(report.incident.assignedModeratorUserId ?? "");
  const [assignmentReason, setAssignmentReason] = useState("");
  const [assignmentNote, setAssignmentNote] = useState("");
  const [localError, setLocalError] = useState("");
  const policies = [...new Set([...report.policyCodes, ...report.incident.policyCodes])];

  function submitTransition(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const built = buildConductTransitionIntent(report, {
      toStatus,
      reason: transitionReason,
      note: transitionNote
    });
    if (!built.ok) {
      setLocalError(built.error);
      return;
    }
    setLocalError("");
    onCommand(built.command);
  }

  function submitAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const built = buildConductAssignmentIntent(report, {
      assigneeUserId: assigneeUserId || null,
      reason: assignmentReason,
      note: assignmentNote
    }, assignees);
    if (!built.ok) {
      setLocalError(built.error);
      return;
    }
    setLocalError("");
    onCommand(built.command);
  }

  return (
    <article aria-busy={pendingAction !== null} className="surface min-w-0 overflow-hidden rounded-md" id={`conduct-report-${report.id}`}>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] p-4 sm:p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-all text-xl font-semibold text-[var(--gold)]">{report.reference}</h2>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(report.status)}`}>
              {humanizeConductValue(report.status)}
            </span>
            <span className="pill rounded-full px-3 py-1 text-xs">Version {report.version}</span>
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {humanizeConductValue(report.type)} report · Updated {stableDate(report.updatedAt)}
          </p>
        </div>
        <a
          aria-label={`Open source for report ${report.reference}`}
          className="btn-secondary shrink-0 px-4 py-2 text-sm"
          href={report.incident.permalink}
        >
          Open source
        </a>
      </header>

      <div className="grid min-w-0 gap-4 p-4 sm:p-5 lg:grid-cols-2">
        <section className="min-w-0 rounded-md border border-[var(--line)] p-4">
          <h3 className="font-semibold text-[var(--gold)]">Report and member</h3>
          <dl className="mt-3 grid min-w-0 gap-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
            <dt className="text-[var(--muted)]">Member</dt><dd className="break-words">{report.reportedMember.label}</dd>
            <dt className="text-[var(--muted)]">Report reason</dt><dd className="break-words">{humanizeConductValue(report.reasonCode)}</dd>
            <dt className="text-[var(--muted)]">Submitted by</dt><dd className="break-words">{report.reporterMember?.label ?? "Platform review"}</dd>
            <dt className="text-[var(--muted)]">Current reviewer</dt><dd className="break-words">{report.incident.assignedModerator?.label ?? "Unassigned"}</dd>
            {report.dispute ? <><dt className="text-[var(--muted)]">Dispute</dt><dd className="break-words">{report.dispute.reference} · {humanizeConductValue(report.dispute.status)}</dd></> : null}
          </dl>
        </section>

        <section className="min-w-0 rounded-md border border-[var(--line)] p-4">
          <h3 className="font-semibold text-[var(--gold)]">Incident and source</h3>
          <dl className="mt-3 grid min-w-0 gap-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
            <dt className="text-[var(--muted)]">Incident</dt><dd className="break-all">{report.incident.reference}</dd>
            <dt className="text-[var(--muted)]">Incident status</dt><dd>{humanizeConductValue(report.incident.status)}</dd>
            <dt className="text-[var(--muted)]">Source</dt><dd>{humanizeConductValue(report.incident.source)}</dd>
            <dt className="text-[var(--muted)]">Location</dt><dd>{humanizeConductValue(report.incident.locationType)}</dd>
            <dt className="text-[var(--muted)]">Subject member</dt><dd className="break-words">{report.incident.subjectMember.label}</dd>
            <dt className="text-[var(--muted)]">Content reference</dt><dd className="break-all font-mono text-xs">{report.incident.subjectContentId}</dd>
          </dl>
        </section>
      </div>

      <section className="mx-4 mb-4 min-w-0 rounded-md border border-[var(--line)] p-4 sm:mx-5 sm:mb-5">
        <h3 className="font-semibold text-[var(--gold)]">Context and policies</h3>
        <p className="mt-3 whitespace-pre-wrap break-words leading-7 text-[var(--text)]">
          {report.context ?? "No additional report context was supplied."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {policies.length > 0
            ? policies.map((policy) => <span className="pill max-w-full break-all rounded-full px-3 py-1 text-xs" key={policy}>{policy}</span>)
            : <span className="text-sm text-[var(--muted)]">No policy codes were recorded.</span>}
        </div>
        {report.incident.contextSummary ? (
          <details className="mt-4 min-w-0 rounded-md border border-[var(--line)] p-3">
            <summary className="cursor-pointer font-semibold">Incident evidence context</summary>
            <pre className="mt-3 max-w-full whitespace-pre-wrap break-words font-sans text-sm leading-6 text-[var(--muted)]">{report.incident.contextSummary}</pre>
          </details>
        ) : null}
        {report.resolutionReason ? (
          <div className="mt-4 rounded-md border border-[var(--line)] p-3 text-sm">
            <strong>Latest resolution note</strong>
            <p className="mt-2 whitespace-pre-wrap break-words text-[var(--muted)]">{report.resolutionReason}</p>
          </div>
        ) : null}
      </section>

      {localError ? <p className="mx-4 mb-4 rounded-md border border-[var(--red)] p-3 text-sm text-[var(--red)] sm:mx-5" role="alert">{localError}</p> : null}

      <div className="grid min-w-0 gap-4 border-t border-[var(--line)] p-4 sm:p-5 lg:grid-cols-2">
        <form className="min-w-0 rounded-md border border-[var(--line)] p-4" onSubmit={submitTransition}>
          <h3 className="text-lg font-semibold text-[var(--gold)]">Change report status</h3>
          {transitions.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">No generic status changes are available. Disputes and restrictions require their dedicated reviewed workflows.</p> : (
            <div className="mt-4 grid gap-3">
              <label className="grid gap-2 text-sm font-semibold" htmlFor={`conduct-status-${report.id}`}>
                New status
                <select className="form-field" disabled={busy} id={`conduct-status-${report.id}`} onChange={(event) => setToStatus(event.target.value)} value={toStatus}>
                  {transitions.map((status) => <option key={status} value={status}>{humanizeConductValue(status)}</option>)}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold" htmlFor={`conduct-transition-reason-${report.id}`}>
                Administrative reason
                <textarea className="form-field min-h-24 resize-y" disabled={busy} id={`conduct-transition-reason-${report.id}`} maxLength={1000} onChange={(event) => setTransitionReason(event.target.value)} placeholder="Why this status change is required (10 characters minimum)" value={transitionReason} />
              </label>
              <label className="grid gap-2 text-sm font-semibold" htmlFor={`conduct-transition-note-${report.id}`}>
                Review note
                <textarea className="form-field min-h-24 resize-y" disabled={busy} id={`conduct-transition-note-${report.id}`} maxLength={4000} onChange={(event) => setTransitionNote(event.target.value)} placeholder="What the reviewer found or decided" value={transitionNote} />
              </label>
              <button className={toStatus === "DISMISSED" ? "btn-danger" : "btn-primary"} disabled={busy || transitionReason.trim().length < 10 || transitionNote.trim().length < 2} type="submit">
                {pendingAction === "transition" ? "Applying status…" : "Apply status change"}
              </button>
            </div>
          )}
        </form>

        <form className="min-w-0 rounded-md border border-[var(--line)] p-4" onSubmit={submitAssignment}>
          <h3 className="text-lg font-semibold text-[var(--gold)]">Assign reviewer</h3>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-2 text-sm font-semibold" htmlFor={`conduct-assignee-${report.id}`}>
              Reviewer
              <select className="form-field" disabled={busy} id={`conduct-assignee-${report.id}`} onChange={(event) => setAssigneeUserId(event.target.value)} value={assigneeUserId}>
                <option value="">Unassigned</option>
                {currentAssigneeUnavailable ? (
                  <option disabled value={report.incident.assignedModeratorUserId ?? ""}>
                    {report.incident.assignedModerator?.label ?? "Unavailable reviewer"} · unavailable
                  </option>
                ) : null}
                {assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.label} · {assignee.role}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold" htmlFor={`conduct-assignment-reason-${report.id}`}>
              Administrative reason
              <textarea className="form-field min-h-24 resize-y" disabled={busy} id={`conduct-assignment-reason-${report.id}`} maxLength={1000} onChange={(event) => setAssignmentReason(event.target.value)} placeholder="Why this assignment is required (10 characters minimum)" value={assignmentReason} />
            </label>
            <label className="grid gap-2 text-sm font-semibold" htmlFor={`conduct-assignment-note-${report.id}`}>
              Assignment note
              <textarea className="form-field min-h-24 resize-y" disabled={busy} id={`conduct-assignment-note-${report.id}`} maxLength={4000} onChange={(event) => setAssignmentNote(event.target.value)} placeholder="Handoff details for the reviewer" value={assignmentNote} />
            </label>
            <button className="btn-primary" disabled={busy || (assigneeUserId || null) === report.incident.assignedModeratorUserId || assignmentReason.trim().length < 10 || assignmentNote.trim().length < 2} type="submit">
              {pendingAction === "assignment" ? "Saving assignment…" : assigneeUserId ? "Assign reviewer" : "Remove assignment"}
            </button>
          </div>
        </form>
      </div>
    </article>
  );
}

export function AdminConductReview({ initialView }: { initialView: ConductAdminView }) {
  const [view, setView] = useState(initialView);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | ConductReportStatusView>("all");
  const [assignee, setAssignee] = useState("all");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingOperation, setPendingOperation] = useState<
    | { kind: "refresh" }
    | { kind: "command"; reportId: string; action: "transition" | "assignment" }
    | null
  >(null);
  const activeRequestRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);
  const commandRef = useRef<{ intent: string; commandId: string } | null>(null);

  useEffect(() => {
    return () => {
      requestSequenceRef.current += 1;
      activeRequestRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    requestSequenceRef.current += 1;
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    commandRef.current = null;
    setView(initialView);
    setMessage("");
    setError("");
    setPendingOperation(null);
  }, [initialView]);

  function isCurrentRequest(sequence: number, controller: AbortController) {
    return requestSequenceRef.current === sequence && activeRequestRef.current === controller && !controller.signal.aborted;
  }

  async function readPayload(response: Response) {
    try {
      return await response.json() as unknown;
    } catch {
      return null;
    }
  }

  async function fetchCurrentView(
    sequence: number,
    controller: AbortController,
    filters: { query: string; status: "all" | ConductReportStatusView; assignee: string }
  ) {
    const response = await fetch(conductAdminViewUrl(filters), {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    const payload = await readPayload(response);
    if (!isCurrentRequest(sequence, controller)) return false;
    if (!response.ok || !isConductAdminView(payload)) {
      const apiError = conductErrorResponse(payload);
      throw new Error(apiError.error ?? "The current conduct report queue could not be loaded.");
    }
    setView(payload);
    return true;
  }

  async function refresh(announcement = "The conduct report queue is current.") {
    if (pendingOperation?.kind === "command") return;
    const filters = { query, status, assignee };
    activeRequestRef.current?.abort();
    const controller = new AbortController();
    activeRequestRef.current = controller;
    const sequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = sequence;
    setError("");
    setMessage("");
    setPendingOperation({ kind: "refresh" });
    try {
      await fetchCurrentView(sequence, controller, filters);
      if (isCurrentRequest(sequence, controller)) setMessage(announcement);
    } catch (requestError) {
      if (!isCurrentRequest(sequence, controller)) return;
      setError(requestError instanceof Error ? requestError.message : "The conduct report queue could not be refreshed.");
    } finally {
      if (isCurrentRequest(sequence, controller)) {
        setPendingOperation(null);
        activeRequestRef.current = null;
      }
    }
  }

  async function applyCommand(command: ConductCommandIntent) {
    if (pendingOperation) return;
    const filters = { query, status, assignee };
    const commandIdentity = conductCommandIdentity(
      commandRef.current,
      command,
      () => `conduct-report:${globalThis.crypto.randomUUID()}`
    );
    const commandId = commandIdentity.commandId;
    commandRef.current = commandIdentity;

    activeRequestRef.current?.abort();
    const controller = new AbortController();
    activeRequestRef.current = controller;
    const sequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = sequence;
    setError("");
    setMessage("");
    setPendingOperation({
      kind: "command",
      reportId: command.target.id,
      action: command.action === "conduct-report.transition" ? "transition" : "assignment"
    });

    try {
      const response = await fetch("/api/admin/conduct", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ ...command, commandId }),
        signal: controller.signal
      });
      const payload = await readPayload(response);
      if (!isCurrentRequest(sequence, controller)) return;

      if (!response.ok) {
        const apiError = conductErrorResponse(payload);
        if (apiError.code === "VERSION_CONFLICT" || response.status === 409) {
          await fetchCurrentView(sequence, controller, filters);
          if (!isCurrentRequest(sequence, controller)) return;
          setError("This report changed before your command was applied. The current report and version are now shown; review them before submitting again.");
          return;
        }
        if (apiError.error?.toLowerCase().includes("command id")) commandRef.current = null;
        setError(apiError.error ?? "The conduct report command was not applied.");
        return;
      }

      if (!isConductMutationForCommand(payload, commandId, command)) {
        setError("The server returned an incomplete or mismatched receipt. Retry the identical command safely; its command identifier will be reused.");
        return;
      }
      const receiptMessage =
        payload.receipt.replayed
          ? `This identical command was already completed. The current report was refreshed. Prior audit receipt: ${payload.receipt.auditLogId}.`
          : `The conduct report was updated. Audit receipt: ${payload.receipt.auditLogId}.`;
      commandRef.current = null;
      try {
        await fetchCurrentView(sequence, controller, filters);
      } catch (refreshError) {
        if (!isCurrentRequest(sequence, controller)) return;
        setMessage(receiptMessage);
        setError(
          refreshError instanceof Error
            ? `The command succeeded, but the current filtered queue could not be reloaded: ${refreshError.message}`
            : "The command succeeded, but the current filtered queue could not be reloaded. Use Refresh reports to try again."
        );
        return;
      }
      if (!isCurrentRequest(sequence, controller)) return;
      setMessage(receiptMessage);
    } catch (requestError) {
      if (!isCurrentRequest(sequence, controller)) return;
      setError(
        requestError instanceof Error && requestError.name !== "AbortError"
          ? `${requestError.message} Retry to safely reuse this exact command.`
          : "The request was interrupted. Retry to safely reuse this exact command."
      );
    } finally {
      if (isCurrentRequest(sequence, controller)) {
        setPendingOperation(null);
        activeRequestRef.current = null;
      }
    }
  }

  return (
    <div aria-busy={pendingOperation !== null} className="grid min-w-0 gap-5">
      <section className="surface min-w-0 rounded-md p-4 sm:p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Member Safety</p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-4xl">
            <h1 className="text-3xl font-semibold">Conduct report review</h1>
            <p className="mt-3 leading-7 text-[var(--muted)]">
              Review current reports, follow their source, assign an active administrator, and record a versioned status decision. Every change requires a reason and note and returns an audit receipt.
            </p>
          </div>
          <button className="btn-secondary shrink-0" disabled={pendingOperation !== null} onClick={() => void refresh()} type="button">
            {pendingOperation?.kind === "refresh" ? "Refreshing…" : "Refresh reports"}
          </button>
        </div>
      </section>

      {message ? <p aria-live="polite" className="rounded-md border border-[var(--green)] bg-[var(--panel)] p-4 text-sm text-[var(--text)]" role="status">{message}</p> : null}
      {error ? <p className="rounded-md border border-[var(--red)] bg-[var(--panel)] p-4 text-sm text-[var(--red)]" role="alert">{error}</p> : null}

      <form className="surface min-w-0 rounded-md p-4 sm:p-5" onSubmit={(event) => { event.preventDefault(); void refresh("Matching conduct reports loaded."); }}>
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(11rem,0.35fr)_minmax(12rem,0.45fr)]">
          <label className="grid min-w-0 gap-2 text-sm font-semibold" htmlFor="conduct-report-search">
            Find a report
            <input className="form-field min-w-0" disabled={pendingOperation !== null} id="conduct-report-search" maxLength={120} onChange={(event) => setQuery(event.target.value)} placeholder="Reference, member, source, context, or policy…" type="search" value={query} />
          </label>
          <label className="grid min-w-0 gap-2 text-sm font-semibold" htmlFor="conduct-report-status-filter">
            Status
            <select className="form-field min-w-0" disabled={pendingOperation !== null} id="conduct-report-status-filter" onChange={(event) => setStatus(event.target.value as "all" | ConductReportStatusView)} value={status}>
              <option value="all">All statuses</option>
              {CONDUCT_REPORT_STATUSES.map((item) => <option key={item} value={item}>{humanizeConductValue(item)}</option>)}
            </select>
          </label>
          <label className="grid min-w-0 gap-2 text-sm font-semibold" htmlFor="conduct-report-assignee-filter">
            Reviewer
            <select className="form-field min-w-0" disabled={pendingOperation !== null} id="conduct-report-assignee-filter" onChange={(event) => setAssignee(event.target.value)} value={assignee}>
              <option value="all">All reviewers</option>
              <option value="unassigned">Unassigned</option>
              {view.assignees.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className="text-sm text-[var(--muted)]">
            Showing {view.reports.length} matching reports. Loaded {stableDate(view.generatedAt)}.
          </p>
          <button className="btn-primary" disabled={pendingOperation !== null} type="submit">
            {pendingOperation?.kind === "refresh" ? "Searching…" : "Search reports"}
          </button>
        </div>
      </form>

      <section aria-label="Conduct reports" className="grid min-w-0 gap-5">
        {view.reports.length === 0 ? (
          <div className="surface rounded-md p-8 text-center">
            <h2 className="text-xl font-semibold text-[var(--gold)]">No matching reports</h2>
            <p className="mt-2 text-[var(--muted)]">Change the search or filters, or refresh to load the latest report queue.</p>
          </div>
        ) : null}
        {view.reports.map((report) => (
          <ReportCard
            assignees={view.assignees}
            busy={pendingOperation !== null}
            key={`${report.id}:${report.version}:${report.incident.assignedModeratorUserId ?? "unassigned"}`}
            onCommand={(command) => void applyCommand(command)}
            pendingAction={pendingOperation?.kind === "command" && pendingOperation.reportId === report.id
              ? pendingOperation.action
              : null}
            report={report}
          />
        ))}
      </section>
    </div>
  );
}
