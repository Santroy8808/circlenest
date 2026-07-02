"use client";

export function PrintButton() {
  return (
    <button className="btn-primary" onClick={() => window.print()} type="button">
      Print
    </button>
  );
}
