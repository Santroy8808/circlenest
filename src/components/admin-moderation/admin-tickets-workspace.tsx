"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FEEDBACK_TYPE_OPTIONS,
  type ConfiguredFeedbackKind
} from "@/modules/feedback-support/config";
import type { AdminFeedbackTicketListView } from "@/modules/feedback-support/feedback-support.service";

type TicketRow = AdminFeedbackTicketListView["tickets"][number];
type Filters = {
  search: string;
  kind: string;
  status: "OPEN" | "RESOLVED" | "ALL";
  assignment: "ALL" | "UNASSIGNED" | "ME" | "OTHER";
  sort: "createdAt" | "updatedAt" | "status" | "assignedTo" | "kind" | "openDuration";
  direction: "asc" | "desc";
};
type Assignee = { id: string; name: string; username: string };
type TicketMessage = {
  id: string;
  type: "NORMAL" | "INTERNAL";
  body: string;
  createdAt: string;
  sender: { id: string; name: string; username: string; isAdmin: boolean } | null;
};
type AdminTicketDetail = {
  publicId: string;
  version: number;
  kind: string;
  kindLabel: string;
  subject: string;
  description: string;
  status: string;
  severity: string;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  resolvedAt: string | null;
  openDurationMs: number;
  sourceUrl: string | null;
  sourceRoute: string | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  pageContext: unknown;
  clientContext: unknown;
  diagnostics: unknown;
  screenshot: {
    id: string;
    mimeType: string;
    sizeBytes: string;
    fileName: string | null;
    href: string;
  } | null;
  reporter: { id: string; name: string; username: string; email: string } | null;
  assignedTo: { id: string; name: string; username: string } | null;
  resolvedBy: { id: string; name: string } | null;
  resolution: string | null;
  messages: TicketMessage[];
  history: Array<{
    id: string;
    action: string;
    oldValue: unknown;
    newValue: unknown;
    metadata: unknown;
    createdAt: string;
    actor: { id: string; name: string } | null;
  }>;
};

const DEFAULT_FILTERS: Filters = {
  search: "",
  kind: "",
  status: "OPEN",
  assignment: "ALL",
  sort: "updatedAt",
  direction: "desc"
};

function initialFilters(query: Record<string, string>) {
  const filters = { ...DEFAULT_FILTERS };
  if (typeof query.search === "string") filters.search = query.search;
  if (FEEDBACK_TYPE_OPTIONS.some((option) => option.value === query.kind)) filters.kind = query.kind;
  if (["OPEN", "RESOLVED", "ALL"].includes(query.status)) filters.status = query.status as Filters["status"];
  if (["ALL", "UNASSIGNED", "ME", "OTHER"].includes(query.assignment)) {
    filters.assignment = query.assignment as Filters["assignment"];
  }
  if (["createdAt", "updatedAt", "status", "assignedTo", "kind", "openDuration"].includes(query.sort)) {
    filters.sort = query.sort as Filters["sort"];
  }
  if (query.direction === "asc" || query.direction === "desc") filters.direction = query.direction;
  return filters;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDuration(milliseconds: number) {
  const minutes = Math.max(1, Math.floor(milliseconds / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"}`;
  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"}`;
}

function actionLabel(action: string) {
  return action
    .replace(/^ticket\./, "")
    .replace(/^message\./, "")
    .replace(/\./g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function apiFilters(filters: Filters) {
  const parameters = new URLSearchParams();
  if (filters.search.trim()) parameters.set("search", filters.search.trim());
  if (filters.kind) parameters.set("kind", filters.kind);
  parameters.set("status", filters.status);
  parameters.set("assignment", filters.assignment);
  parameters.set("sort", filters.sort);
  parameters.set("direction", filters.direction);
  return parameters;
}

async function readResponse<T>(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "The ticket request failed.");
  return payload;
}

export function AdminTicketsWorkspace({
  initialView,
  initialQuery
}: {
  initialView: AdminFeedbackTicketListView;
  initialQuery: Record<string, string>;
}) {
  const [view, setView] = useState(initialView);
  const [filters, setFilters] = useState<Filters>(() => initialFilters(initialQuery));
  const [searchDraft, setSearchDraft] = useState(() => initialQuery.search ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [routeAssigneeId, setRouteAssigneeId] = useState("");
  const [bulkKind, setBulkKind] = useState<ConfiguredFeedbackKind>("BUG");
  const [detail, setDetail] = useState<AdminTicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [listError, setListError] = useState("");
  const [isActing, setIsActing] = useState(false);
  const [messageType, setMessageType] = useState<"NORMAL" | "INTERNAL">("INTERNAL");
  const [messageBody, setMessageBody] = useState("");
  const [messageState, setMessageState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [messageError, setMessageError] = useState("");
  const [resolution, setResolution] = useState("");
  const [finalReply, setFinalReply] = useState("");
  const [detailKind, setDetailKind] = useState("");
  const [detailAssigneeId, setDetailAssigneeId] = useState("");
  const messageRequestId = useRef("");
  const drawerRef = useRef<HTMLElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const initialTicketRef = useRef<string | undefined>(initialQuery.ticket);

  const selectedRows = useMemo(
    () => view.tickets.filter((ticket) => selected.has(ticket.publicId)),
    [selected, view.tickets]
  );
  const allVisibleSelected =
    view.tickets.length > 0 && view.tickets.every((ticket) => selected.has(ticket.publicId));
  const hasOpenDetail = Boolean(detail?.publicId);

  const syncUrl = useCallback((nextFilters: Filters, ticketId?: string | null) => {
    const url = new URL(window.location.href);
    url.search = apiFilters(nextFilters).toString();
    if (ticketId) url.searchParams.set("ticket", ticketId);
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const refreshTickets = useCallback(async (nextFilters = filters, quiet = false) => {
    if (!quiet) setListError("");
    try {
      const payload = await readResponse<AdminFeedbackTicketListView>(
        await fetch(`/api/admin/tickets?${apiFilters(nextFilters)}`, { cache: "no-store" })
      );
      setView(payload);
      setSelected((current) => {
        const visible = new Set(payload.tickets.map((ticket) => ticket.publicId));
        return new Set([...current].filter((ticketId) => visible.has(ticketId)));
      });
    } catch (error) {
      if (!quiet) setListError(error instanceof Error ? error.message : "Could not refresh tickets.");
    }
  }, [filters]);

  const openTicket = useCallback(async (publicId: string, updateUrl = true) => {
    if (!hasOpenDetail) lastFocusedRef.current = document.activeElement as HTMLElement | null;
    setDetailLoading(true);
    setDetailError("");
    setMessageType("INTERNAL");
    setMessageBody("");
    setMessageState("idle");
    setMessageError("");
    messageRequestId.current = "";
    try {
      const payload = await readResponse<{ audience: "admin"; ticket: AdminTicketDetail }>(
        await fetch(`/api/feedback/tickets/${encodeURIComponent(publicId)}`, { cache: "no-store" })
      );
      setDetail(payload.ticket);
      setDetailKind(
        payload.ticket.kind === "ISSUE_REPORT"
          ? "BUG"
          : payload.ticket.kind === "SUPPORT_REQUEST"
            ? "OTHER"
            : payload.ticket.kind
      );
      setDetailAssigneeId(payload.ticket.assignedTo?.id ?? "");
      setResolution(payload.ticket.resolution ?? "");
      setFinalReply("");
      if (updateUrl) syncUrl(filters, publicId);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Could not open the ticket.");
    } finally {
      setDetailLoading(false);
    }
  }, [filters, hasOpenDetail, syncUrl]);

  const closeTicket = useCallback(() => {
    setDetail(null);
    setDetailError("");
    syncUrl(filters, null);
    window.setTimeout(() => lastFocusedRef.current?.focus(), 0);
  }, [filters, syncUrl]);

  useEffect(() => {
    void fetch("/api/admin/tickets/assignees", { cache: "no-store" })
      .then((response) => readResponse<{ assignees: Assignee[] }>(response))
      .then((payload) => setAssignees(payload.assignees))
      .catch(() => setAssignees([]));
  }, []);

  useEffect(() => {
    const initialTicket = initialTicketRef.current;
    if (!initialTicket) return;
    initialTicketRef.current = undefined;
    void openTicket(initialTicket, false);
  }, [openTicket]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshTickets(filters, true);
      if (detail) void openTicket(detail.publicId, false);
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [filters, detail, openTicket, refreshTickets]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchDraft === filters.search) return;
      const next = { ...filters, search: searchDraft };
      setFilters(next);
      syncUrl(next, detail?.publicId);
      void refreshTickets(next);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [detail?.publicId, filters, refreshTickets, searchDraft, syncUrl]);

  useEffect(() => {
    if (!detail && !detailLoading && !detailError) return;
    const drawer = drawerRef.current;
    const focusable = () =>
      Array.from(
        drawer?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], summary"
        ) ?? []
      );
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeTicket();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    window.setTimeout(() => focusable()[0]?.focus(), 0);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeTicket, detail, detailLoading, detailError]);

  function changeFilters(patch: Partial<Filters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    syncUrl(next, detail?.publicId);
    void refreshTickets(next);
  }

  function toggleTicket(publicId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(publicId)) next.delete(publicId);
      else next.add(publicId);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) view.tickets.forEach((ticket) => next.delete(ticket.publicId));
      else view.tickets.forEach((ticket) => next.add(ticket.publicId));
      return next;
    });
  }

  async function runBulkAction(
    action: "ASSIGN_TO_ME" | "ASSIGN" | "RESOLVE" | "REOPEN" | "CHANGE_KIND"
  ) {
    if (selectedRows.length === 0 || isActing) return;
    if (
      (action === "ASSIGN" || action === "RESOLVE") &&
      !window.confirm(
        action === "ASSIGN"
          ? `Route ${selectedRows.length} selected ticket(s) to another administrator?`
          : `Mark ${selectedRows.length} selected ticket(s) resolved?`
      )
    ) return;
    if (action === "ASSIGN" && !routeAssigneeId) {
      setListError("Choose an administrator first.");
      return;
    }

    setIsActing(true);
    setListError("");
    try {
      await readResponse(
        await fetch("/api/admin/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            ticketIds: selectedRows.map((ticket) => ticket.publicId),
            expectedVersions: Object.fromEntries(
              selectedRows.map((ticket) => [ticket.publicId, ticket.version])
            ),
            ...(action === "ASSIGN" ? { assigneeUserId: routeAssigneeId } : {}),
            ...(action === "CHANGE_KIND" ? { kind: bulkKind } : {})
          })
        })
      );
      setSelected(new Set());
      await refreshTickets();
      if (detail && selectedRows.some((ticket) => ticket.publicId === detail.publicId)) {
        await openTicket(detail.publicId, false);
      }
    } catch (error) {
      setListError(error instanceof Error ? error.message : "Could not update the selected tickets.");
    } finally {
      setIsActing(false);
    }
  }

  async function updateTicket(patch: Record<string, unknown>) {
    if (!detail || isActing) return;
    setIsActing(true);
    setDetailError("");
    try {
      await readResponse(
        await fetch(`/api/admin/tickets/${encodeURIComponent(detail.publicId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: detail.version, ...patch })
        })
      );
      await Promise.all([
        refreshTickets(),
        openTicket(detail.publicId, false)
      ]);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Could not update the ticket.");
    } finally {
      setIsActing(false);
    }
  }

  async function assignDetailToMe() {
    if (!detail || isActing) return;
    setIsActing(true);
    setDetailError("");
    try {
      await readResponse(
        await fetch("/api/admin/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "ASSIGN_TO_ME",
            ticketIds: [detail.publicId],
            expectedVersions: { [detail.publicId]: detail.version }
          })
        })
      );
      await Promise.all([refreshTickets(), openTicket(detail.publicId, false)]);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Could not assign the ticket.");
    } finally {
      setIsActing(false);
    }
  }

  function changeMessageType(nextType: "NORMAL" | "INTERNAL") {
    if (
      messageType === "INTERNAL" &&
      nextType === "NORMAL" &&
      messageBody.trim() &&
      !window.confirm("This text will become visible to the ticket creator. Change to Reply to User?")
    ) return;
    setMessageType(nextType);
    setMessageState("idle");
    setMessageError("");
  }

  async function sendMessage() {
    if (!detail || !messageBody.trim() || messageState === "sending") return;
    if (!messageRequestId.current) messageRequestId.current = crypto.randomUUID();
    setMessageState("sending");
    setMessageError("");
    try {
      await readResponse(
        await fetch(`/api/feedback/tickets/${encodeURIComponent(detail.publicId)}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: messageType,
            body: messageBody,
            idempotencyKey: messageRequestId.current
          })
        })
      );
      setMessageBody("");
      messageRequestId.current = "";
      await Promise.all([refreshTickets(), openTicket(detail.publicId, false)]);
      setMessageState("sent");
    } catch (error) {
      setMessageState("failed");
      setMessageError(error instanceof Error ? error.message : "Could not send the message.");
    }
  }

  async function resolveTicket() {
    if (!detail) return;
    if (!window.confirm(`Mark ${detail.publicId} resolved?`)) return;
    await updateTicket({
      status: "RESOLVED",
      resolution: resolution.trim() || undefined,
      ...(finalReply.trim()
        ? {
            finalMessage: finalReply.trim(),
            messageIdempotencyKey: crypto.randomUUID()
          }
        : {})
    });
  }

  return (
    <main className="admin-tickets-workspace" data-admin-tickets>
      <header className="admin-tickets-header">
        <div>
          <p className="admin-tickets-eyebrow">Admin Settings</p>
          <h1>Tickets</h1>
          <p>Shared Feedback from Theta-Space members.</p>
        </div>
        <div className="admin-ticket-summary" aria-label="Ticket summary">
          <span><strong>{view.summary.open}</strong> open</span>
          <span><strong>{view.summary.unassigned}</strong> unassigned</span>
          <span><strong>{view.summary.assignedToMe}</strong> mine</span>
        </div>
      </header>

      <section className="admin-ticket-controls" aria-label="Ticket filters">
        <label className="admin-ticket-search">
          <span className="form-label">Search</span>
          <input
            className="form-field"
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Ticket, subject, member, message, URL"
            type="search"
            value={searchDraft}
          />
        </label>

        <fieldset className="admin-ticket-filter-group">
          <legend>Feedback Type</legend>
          <div className="admin-ticket-segments">
            <button
              aria-pressed={!filters.kind}
              className={!filters.kind ? "is-active" : ""}
              onClick={() => changeFilters({ kind: "" })}
              type="button"
            >
              All
            </button>
            {FEEDBACK_TYPE_OPTIONS.map((option) => (
              <button
                aria-pressed={filters.kind === option.value}
                className={filters.kind === option.value ? "is-active" : ""}
                key={option.value}
                onClick={() => changeFilters({ kind: option.value })}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="admin-ticket-filter-row">
          <label>
            <span className="form-label">Status</span>
            <select
              className="form-field"
              onChange={(event) => changeFilters({ status: event.target.value as Filters["status"] })}
              value={filters.status}
            >
              <option value="OPEN">Open</option>
              <option value="RESOLVED">Resolved</option>
              <option value="ALL">All Statuses</option>
            </select>
          </label>
          <label>
            <span className="form-label">Assignment</span>
            <select
              className="form-field"
              onChange={(event) => changeFilters({ assignment: event.target.value as Filters["assignment"] })}
              value={filters.assignment}
            >
              <option value="ALL">All Assignments</option>
              <option value="UNASSIGNED">Unassigned</option>
              <option value="ME">Assigned to Me</option>
              <option value="OTHER">Another Admin</option>
            </select>
          </label>
          <label>
            <span className="form-label">Sort</span>
            <select
              className="form-field"
              onChange={(event) => changeFilters({ sort: event.target.value as Filters["sort"] })}
              value={filters.sort}
            >
              <option value="updatedAt">Latest Activity</option>
              <option value="createdAt">Created</option>
              <option value="status">Status</option>
              <option value="assignedTo">Assigned Admin</option>
              <option value="kind">Feedback Type</option>
              <option value="openDuration">Open Duration</option>
            </select>
          </label>
          <label>
            <span className="form-label">Direction</span>
            <select
              className="form-field"
              onChange={(event) => changeFilters({ direction: event.target.value as Filters["direction"] })}
              value={filters.direction}
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </label>
        </div>
      </section>

      {selectedRows.length > 0 ? (
        <section className="admin-ticket-bulk-bar" aria-label="Actions for selected tickets">
          <strong>{selectedRows.length} selected</strong>
          <button disabled={isActing} onClick={() => void runBulkAction("ASSIGN_TO_ME")} type="button">
            Assign to Me
          </button>
          <select
            aria-label="Route selected tickets to administrator"
            onChange={(event) => setRouteAssigneeId(event.target.value)}
            value={routeAssigneeId}
          >
            <option value="">Choose administrator</option>
            {assignees.map((assignee) => (
              <option key={assignee.id} value={assignee.id}>{assignee.name}</option>
            ))}
          </select>
          <button disabled={isActing || !routeAssigneeId} onClick={() => void runBulkAction("ASSIGN")} type="button">
            Route
          </button>
          <select
            aria-label="Change selected tickets' Feedback Type"
            onChange={(event) => setBulkKind(event.target.value as ConfiguredFeedbackKind)}
            value={bulkKind}
          >
            {FEEDBACK_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button disabled={isActing} onClick={() => void runBulkAction("CHANGE_KIND")} type="button">
            Change Type
          </button>
          <button disabled={isActing} onClick={() => void runBulkAction("RESOLVE")} type="button">
            Mark Resolved
          </button>
          <button disabled={isActing} onClick={() => void runBulkAction("REOPEN")} type="button">
            Reopen
          </button>
        </section>
      ) : null}

      {listError ? <p className="feedback-inline-error" role="alert">{listError}</p> : null}

      <section className="admin-ticket-table-wrap" aria-label="Shared ticket list">
        <table className="admin-ticket-table">
          <thead>
            <tr>
              <th>
                <input
                  aria-label="Select all visible tickets"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  type="checkbox"
                />
              </th>
              <th>Ticket</th>
              <th>Type</th>
              <th>Subject</th>
              <th>Submitter</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Assigned</th>
              <th>Created</th>
              <th>Open</th>
              <th>Latest</th>
              <th>Signals</th>
            </tr>
          </thead>
          <tbody>
            {view.tickets.map((ticket) => (
              <tr
                className={[
                  ticket.assignedTo ? "ticket-row--assigned" : "",
                  ticket.assignedToMe ? "ticket-row--mine" : "",
                  ticket.status === "RESOLVED" || ticket.status === "CLOSED" ? "ticket-row--resolved" : ""
                ].filter(Boolean).join(" ")}
                key={ticket.publicId}
                onClick={() => void openTicket(ticket.publicId)}
              >
                <td onClick={(event) => event.stopPropagation()}>
                  <input
                    aria-label={`Select ${ticket.publicId}`}
                    checked={selected.has(ticket.publicId)}
                    onChange={() => toggleTicket(ticket.publicId)}
                    type="checkbox"
                  />
                </td>
                <td data-label="Ticket">
                  <button
                    aria-label={`Open ${ticket.publicId}: ${ticket.subject}`}
                    className="ticket-open-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void openTicket(ticket.publicId);
                    }}
                    type="button"
                  >
                    {ticket.publicId}
                  </button>
                </td>
                <td data-label="Type">{ticket.kindLabel}</td>
                <td className="admin-ticket-subject" data-label="Subject">{ticket.subject}</td>
                <td data-label="Submitter">{ticket.reporter.name}</td>
                <td data-label="Status"><span className={`ticket-status ticket-status--${ticket.status.toLowerCase()}`}>{ticket.status}</span></td>
                <td data-label="Priority">{ticket.severity}</td>
                <td data-label="Assigned">{ticket.assignedTo?.name ?? "Unassigned"}</td>
                <td data-label="Created">{formatDate(ticket.createdAt)}</td>
                <td data-label="Open">{formatDuration(ticket.openDurationMs)}</td>
                <td data-label="Latest">{formatDate(ticket.lastActivityAt)}</td>
                <td data-label="Signals">
                  <span className="ticket-signals">
                    {ticket.unread ? <span className="ticket-signal ticket-signal--unread">Unread</span> : null}
                    {ticket.hasInternalNotes ? <span className="ticket-signal">Note</span> : null}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {view.tickets.length === 0 ? (
          <p className="admin-ticket-empty">No tickets match these filters.</p>
        ) : null}
      </section>

      {(detail || detailLoading || detailError) ? (
        <div className="ticket-drawer-layer" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeTicket();
        }}>
          <aside aria-label="Ticket detail" aria-modal="true" className="ticket-drawer" ref={drawerRef} role="dialog">
            <header className="ticket-drawer-header">
              <div>
                <p>{detail?.publicId ?? "Ticket"}</p>
                <h2>{detail?.subject ?? (detailLoading ? "Loading..." : "Could not open ticket")}</h2>
              </div>
              <button aria-label="Close ticket" onClick={closeTicket} type="button">Close</button>
            </header>

            {detailError ? <p className="feedback-inline-error" role="alert">{detailError}</p> : null}
            {detail ? (
              <div className="ticket-drawer-content">
                <section className="ticket-detail-summary">
                  <div><span>Status</span><strong>{detail.status}</strong></div>
                  <div><span>Type</span><strong>{detail.kindLabel}</strong></div>
                  <div><span>Submitter</span><strong>{detail.reporter?.name ?? "Unknown"}</strong></div>
                  <div><span>Assigned</span><strong>{detail.assignedTo?.name ?? "Unassigned"}</strong></div>
                  <div><span>Created</span><strong>{formatDate(detail.createdAt)}</strong></div>
                  <div><span>Open</span><strong>{formatDuration(detail.openDurationMs)}</strong></div>
                </section>

                <section className="ticket-detail-controls">
                  <label>
                    <span className="form-label">Feedback Type</span>
                    <select
                      className="form-field"
                      onChange={(event) => setDetailKind(event.target.value)}
                      value={detailKind}
                    >
                      {FEEDBACK_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    disabled={isActing || detailKind === detail.kind}
                    onClick={() => void updateTicket({ kind: detailKind })}
                    type="button"
                  >
                    Change Type
                  </button>
                  <label>
                    <span className="form-label">Assigned Administrator</span>
                    <select
                      className="form-field"
                      onChange={(event) => setDetailAssigneeId(event.target.value)}
                      value={detailAssigneeId}
                    >
                      <option value="">Unassigned</option>
                      {assignees.map((assignee) => (
                        <option key={assignee.id} value={assignee.id}>{assignee.name}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    disabled={isActing || detailAssigneeId === (detail.assignedTo?.id ?? "")}
                    onClick={() => void updateTicket({ assignedToUserId: detailAssigneeId || null })}
                    type="button"
                  >
                    Update Assignment
                  </button>
                  <button disabled={isActing} onClick={() => void assignDetailToMe()} type="button">
                    Assign to Me
                  </button>
                </section>

                <section className="ticket-original-message">
                  <h3>Original Feedback</h3>
                  <p>{detail.description}</p>
                </section>

                <section className="ticket-source-panel">
                  <h3>Page Context</h3>
                  {detail.sourceUrl ? (
                    <a href={detail.sourceUrl} rel="noreferrer" target="_blank">{detail.sourceUrl}</a>
                  ) : <p>No source URL was saved.</p>}
                  {detail.sourceEntityType && detail.sourceEntityId ? (
                    <p>{detail.sourceEntityType}: {detail.sourceEntityId}</p>
                  ) : null}
                  <details>
                    <summary>Browser and recent activity</summary>
                    <pre>{JSON.stringify({
                      pageContext: detail.pageContext,
                      clientContext: detail.clientContext,
                      diagnostics: detail.diagnostics
                    }, null, 2)}</pre>
                  </details>
                </section>

                {detail.screenshot ? (
                  <section className="ticket-screenshot">
                    <h3>Screenshot</h3>
                    <a href={detail.screenshot.href} rel="noreferrer" target="_blank">
                      {/* Private ticket media must be fetched directly with the viewer's session. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img alt={`Screenshot submitted with ${detail.publicId}`} src={detail.screenshot.href} />
                    </a>
                  </section>
                ) : null}

                <section className="ticket-thread">
                  <h3>Conversation</h3>
                  <div className="ticket-messages">
                    {detail.messages.length > 0 ? detail.messages.map((message) => (
                      <article
                        className={[
                          "ticket-message",
                          message.type === "INTERNAL" ? "ticket-message--internal" : "",
                          message.sender?.isAdmin ? "ticket-message--admin" : "ticket-message--creator"
                        ].filter(Boolean).join(" ")}
                        key={message.id}
                      >
                        <header>
                          <strong>{message.sender?.name ?? "Former member"}</strong>
                          {message.type === "INTERNAL" ? <span>Internal Note</span> : <span>{message.sender?.isAdmin ? "Administrator" : "Ticket Creator"}</span>}
                          <time>{formatDate(message.createdAt)}</time>
                        </header>
                        <p>{message.body}</p>
                      </article>
                    )) : <p className="admin-ticket-empty">No replies yet.</p>}
                  </div>

                  <div className={messageType === "INTERNAL" ? "ticket-composer ticket-composer--internal" : "ticket-composer ticket-composer--normal"}>
                    <div className="ticket-composer-modes" role="group" aria-label="Message visibility">
                      <button
                        aria-pressed={messageType === "NORMAL"}
                        className={messageType === "NORMAL" ? "is-active" : ""}
                        onClick={() => changeMessageType("NORMAL")}
                        type="button"
                      >
                        Reply to User
                      </button>
                      <button
                        aria-pressed={messageType === "INTERNAL"}
                        className={messageType === "INTERNAL" ? "is-active" : ""}
                        onClick={() => changeMessageType("INTERNAL")}
                        type="button"
                      >
                        Internal Note
                      </button>
                    </div>
                    <p className="ticket-composer-warning">
                      {messageType === "INTERNAL"
                        ? "Internal Notes are visible only to administrators and are never sent to the ticket creator."
                        : "This reply will be visible to the ticket creator and will notify them."}
                    </p>
                    <textarea
                      className="form-field"
                      onChange={(event) => {
                        setMessageBody(event.target.value);
                        setMessageState("idle");
                      }}
                      placeholder={messageType === "INTERNAL" ? "Add technical findings or admin coordination..." : "Write a reply to the ticket creator..."}
                      value={messageBody}
                    />
                    {messageError ? <p className="feedback-inline-error" role="alert">{messageError}</p> : null}
                    {messageState === "sent" ? <p className="ticket-message-sent" role="status">Message sent.</p> : null}
                    <button
                      disabled={!messageBody.trim() || messageState === "sending"}
                      onClick={() => void sendMessage()}
                      type="button"
                    >
                      {messageState === "sending" ? "Sending..." : messageState === "failed" ? "Retry" : messageType === "INTERNAL" ? "Add Internal Note" : "Send Reply"}
                    </button>
                  </div>
                </section>

                <section className="ticket-resolution-panel">
                  <h3>{detail.status === "RESOLVED" || detail.status === "CLOSED" ? "Resolution" : "Resolve Ticket"}</h3>
                  {detail.status === "RESOLVED" || detail.status === "CLOSED" ? (
                    <>
                      <p>{detail.resolution || "No resolution summary was provided."}</p>
                      <button disabled={isActing} onClick={() => void updateTicket({ status: "OPEN" })} type="button">
                        Reopen Ticket
                      </button>
                    </>
                  ) : (
                    <>
                      <label>
                        <span className="form-label">Resolution summary</span>
                        <textarea className="form-field" onChange={(event) => setResolution(event.target.value)} value={resolution} />
                      </label>
                      <label>
                        <span className="form-label">Final reply to user (optional)</span>
                        <textarea className="form-field" onChange={(event) => setFinalReply(event.target.value)} value={finalReply} />
                      </label>
                      <button disabled={isActing} onClick={() => void resolveTicket()} type="button">
                        Mark Resolved
                      </button>
                    </>
                  )}
                </section>

                <section className="ticket-history">
                  <h3>Ticket History</h3>
                  <ol>
                    {detail.history.map((event) => (
                      <li key={event.id}>
                        <span>{actionLabel(event.action)}</span>
                        <strong>{event.actor?.name ?? "System"}</strong>
                        <time>{formatDate(event.createdAt)}</time>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
    </main>
  );
}
