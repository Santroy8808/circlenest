"use client";

export function ResumePrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="text-sm underline">
      Print / Save as PDF
    </button>
  );
}

