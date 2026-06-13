"use client";

import { useState } from "react";
import { REPORT_REASONS, REPORT_TARGET_TYPES, type ReportReason, type ReportTargetType } from "@/lib/reports/report-types";

type ReportControlProps = {
  targetType: ReportTargetType | (typeof REPORT_TARGET_TYPES)[number];
  targetId: string;
  label?: string;
  compact?: boolean;
  triggerClassName?: string;
  menuAlign?: "left" | "right";
};

export function ReportControl({
  targetType,
  targetId,
  label = "Report",
  compact = false,
  triggerClassName = "",
  menuAlign = "right",
}: ReportControlProps) {
  const [reason, setReason] = useState<ReportReason>("OTHER");
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);

  async function submitReport() {
    setSending(true);
    setStatus("");
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId,
          reason,
          details: details.trim() || null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setStatus(payload.error ?? "Could not submit report");
        return;
      }
      setDetails("");
      setStatus("Report submitted");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[#0f1728] text-slate-300 transition hover:bg-white/5 ${triggerClassName}`}
      >
        <span aria-hidden="true" className="text-lg leading-none">
          ...
        </span>
        <span className="sr-only">{label}</span>
      </button>

      {open ? (
        <div
          role="menu"
          className={`absolute top-10 z-30 w-72 rounded border border-[var(--border)] bg-[#0e1728] p-3 text-sm shadow-2xl ${menuAlign === "right" ? "right-0" : "left-0"}`}
        >
          <div className="rounded border border-rose-400/30 bg-rose-300/10 px-3 py-2 text-xs text-rose-100">
            Only specifics. Any vague, general, or otherwise unuseful data will result in immediate deletion of the report.
          </div>
          <div className="mt-2 rounded border border-[var(--border)] p-2">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Target auto-captured</p>
            <p className="mt-1 break-all text-xs text-slate-300">{targetType}: {targetId}</p>
            <label className="mt-2 block text-xs text-slate-400">
              Reason
              <select value={reason} onChange={(event) => setReason(event.target.value as ReportReason)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm text-slate-900">
                {REPORT_REASONS.map((value) => (
                  <option key={value} value={value}>
                    {value.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-slate-400">
              Details
              <textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                placeholder="Add a short note"
                className="mt-1 min-h-20 w-full rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
              />
            </label>
            <button
              type="button"
              disabled={sending}
              onClick={() => void submitReport()}
              className="rounded bg-[#8f7228] px-3 py-1.5 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? "Sending..." : "Submit report"}
            </button>
            {status ? <p className="text-xs text-slate-400">{status}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

