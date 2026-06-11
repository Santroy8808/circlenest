"use client";

import { useState } from "react";

export function AccountExportClient() {
  const [status, setStatus] = useState("");

  async function exportData() {
    setStatus("Preparing export...");
    const res = await fetch("/api/account/export", { method: "POST", credentials: "same-origin" });
    if (!res.ok) {
      setStatus("Export failed.");
      return;
    }
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `theta-space-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Export downloaded.");
  }

  return (
    <div className="mt-2">
      <button type="button" onClick={() => void exportData()} className="rounded border border-[var(--border)] px-3 py-2 text-sm">
        Export my data
      </button>
      {status ? <p className="mt-2 text-xs text-slate-400">{status}</p> : null}
    </div>
  );
}
